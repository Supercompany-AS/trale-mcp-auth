import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

import {
	CALLBACK_PATH,
	CALLBACK_PORT,
	CLIENT_NAME,
	DCR_ENDPOINT,
	DEFAULT_SCOPES,
	REDIRECT_URI,
} from './config.js';
import { saveCredentials, type Credentials } from './credentials.js';
import { getAuthServerMetadata } from './discovery.js';
import { codeChallenge, generateCodeVerifier, randomState } from './pkce.js';

interface RegisteredClient {
	client_id: string;
	client_secret: string;
	token_endpoint_auth_method: string;
}

interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

function negotiateScopes(supported: string[] | undefined): string {
	if (!supported || supported.length === 0) return DEFAULT_SCOPES.join(' ');
	return DEFAULT_SCOPES.filter((s) => supported.includes(s)).join(' ');
}

async function registerClient(scope: string): Promise<RegisteredClient> {
	const body = {
		client_name: CLIENT_NAME,
		redirect_uris: [REDIRECT_URI],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'client_secret_post',
		scope,
	};

	const res = await fetch(DCR_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Dynamic client registration failed: ${res.status} ${text}`);
	}

	const client = (await res.json()) as RegisteredClient;
	if (!client.client_id || !client.client_secret) {
		throw new Error('Registration response missing client_id or client_secret');
	}
	return client;
}

function openBrowser(url: string): void {
	const cmd =
		platform() === 'darwin' ? `open "${url}"` : platform() === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
	exec(cmd, (err) => {
		if (err) {
			// Best-effort. We still print the URL for manual paste.
			console.error('Could not open browser automatically. Paste this URL manually:');
			console.error(url);
		}
	});
}

interface CallbackResult {
	code: string;
	state: string;
}

function awaitCallback(expectedState: string): Promise<CallbackResult> {
	return new Promise((resolve, reject) => {
		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			if (!req.url) {
				res.statusCode = 400;
				res.end('Missing URL');
				return;
			}
			const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
			if (url.pathname !== CALLBACK_PATH) {
				res.statusCode = 404;
				res.end('Not found');
				return;
			}

			const code = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			const error = url.searchParams.get('error');

			if (error) {
				res.statusCode = 400;
				res.setHeader('Content-Type', 'text/html');
				res.end(renderResultPage('Authorization failed', `Provider returned: <code>${escapeHtml(error)}</code>`));
				server.close();
				reject(new Error(`Authorization error: ${error}`));
				return;
			}

			if (!code || !state) {
				res.statusCode = 400;
				res.end('Missing code or state');
				return;
			}

			if (state !== expectedState) {
				res.statusCode = 400;
				res.end('State mismatch');
				server.close();
				reject(new Error('OAuth state mismatch — possible CSRF, aborted'));
				return;
			}

			res.statusCode = 200;
			res.setHeader('Content-Type', 'text/html');
			res.end(renderResultPage('You can close this tab', 'Authorization complete. Return to your terminal.'));
			server.close();
			resolve({ code, state });
		});

		server.on('error', (err) => reject(err));
		server.listen(CALLBACK_PORT, '127.0.0.1');

		// Safety timeout: kill the server if the user never completes the flow
		const timeout = setTimeout(
			() => {
				server.close();
				reject(new Error('Timed out waiting for OAuth callback (5 minutes)'));
			},
			5 * 60 * 1000,
		);
		server.on('close', () => clearTimeout(timeout));
	});
}

function renderResultPage(title: string, body: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#111}
h1{font-size:20px;margin:0 0 8px}p{color:#555;line-height:1.5}code{background:#f4f4f5;padding:2px 6px;border-radius:4px}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${body}</p></body></html>`;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

async function exchangeCode(params: {
	tokenEndpoint: string;
	code: string;
	codeVerifier: string;
	clientId: string;
	clientSecret: string;
}): Promise<TokenResponse> {
	const form = new URLSearchParams({
		grant_type: 'authorization_code',
		code: params.code,
		redirect_uri: REDIRECT_URI,
		client_id: params.clientId,
		client_secret: params.clientSecret,
		code_verifier: params.codeVerifier,
	});

	const res = await fetch(params.tokenEndpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: form,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Token exchange failed: ${res.status} ${text}`);
	}

	return (await res.json()) as TokenResponse;
}

export async function login(): Promise<Credentials> {
	const metadata = await getAuthServerMetadata();
	const scope = negotiateScopes(metadata.scopes_supported);
	const client = await registerClient(scope);

	const codeVerifier = generateCodeVerifier();
	const challenge = codeChallenge(codeVerifier);
	const state = randomState();

	const authUrl = new URL(metadata.authorization_endpoint);
	authUrl.searchParams.set('response_type', 'code');
	authUrl.searchParams.set('client_id', client.client_id);
	authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
	authUrl.searchParams.set('scope', scope);
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');

	console.log(`Opening browser to authorize ${CLIENT_NAME}...`);
	console.log(`If it doesn't open, visit: ${authUrl.toString()}`);

	const callbackPromise = awaitCallback(state);
	openBrowser(authUrl.toString());

	const { code } = await callbackPromise;

	const tokens = await exchangeCode({
		tokenEndpoint: metadata.token_endpoint,
		code,
		codeVerifier,
		clientId: client.client_id,
		clientSecret: client.client_secret,
	});

	const creds: Credentials = {
		clientId: client.client_id,
		clientSecret: client.client_secret,
		refreshToken: tokens.refresh_token,
		tokenEndpoint: metadata.token_endpoint,
		traleUrl: new URL(metadata.issuer).origin,
		createdAt: new Date().toISOString(),
	};

	await saveCredentials(creds);
	return creds;
}
