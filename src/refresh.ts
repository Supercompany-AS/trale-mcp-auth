import { ACCESS_TOKEN_SAFETY_WINDOW_SECONDS } from './config.js';
import { type Credentials, loadCredentials, saveCredentials } from './credentials.js';

interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
}

interface CachedToken {
	accessToken: string;
	expiresAt: number;
}

let cache: CachedToken | null = null;

async function refreshOnce(creds: Credentials): Promise<TokenResponse> {
	const form = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: creds.refreshToken,
		client_id: creds.clientId,
		client_secret: creds.clientSecret,
	});

	const res = await fetch(creds.tokenEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: form,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(
			`Refresh failed (${res.status}): ${text}. ` +
				`Your refresh token may have been revoked — run "trale-mcp-auth login" to re-authorize.`,
		);
	}

	return (await res.json()) as TokenResponse;
}

/**
 * Returns a valid access token, refreshing if needed. Caches the access token
 * in memory until it nears expiry, and persists rotated refresh tokens to disk.
 */
export async function getAccessToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	if (cache && cache.expiresAt - ACCESS_TOKEN_SAFETY_WINDOW_SECONDS > now) {
		return cache.accessToken;
	}

	const creds = await loadCredentials();
	if (!creds) {
		throw new Error(
			'No Trale credentials found. Run "trale-mcp-auth login" or "npx @trale/mcp-auth login" first.',
		);
	}

	const tokens = await refreshOnce(creds);

	// Supabase rotates refresh tokens on use — persist the new one immediately so
	// we don't lock ourselves out on the next refresh.
	if (tokens.refresh_token && tokens.refresh_token !== creds.refreshToken) {
		await saveCredentials({ ...creds, refreshToken: tokens.refresh_token });
	}

	cache = {
		accessToken: tokens.access_token,
		expiresAt: now + tokens.expires_in,
	};

	return tokens.access_token;
}

export function clearAccessTokenCache(): void {
	cache = null;
}
