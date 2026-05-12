import { AUTH_SERVER_METADATA_URL } from './config.js';

export interface AuthServerMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint: string;
	jwks_uri: string;
	grant_types_supported: string[];
	code_challenge_methods_supported: string[];
	scopes_supported?: string[];
}

let cached: AuthServerMetadata | null = null;

export async function getAuthServerMetadata(): Promise<AuthServerMetadata> {
	if (cached) return cached;

	const res = await fetch(AUTH_SERVER_METADATA_URL);
	if (!res.ok) {
		throw new Error(
			`Failed to fetch OAuth metadata from ${AUTH_SERVER_METADATA_URL} (${res.status} ${res.statusText})`,
		);
	}

	const metadata = (await res.json()) as AuthServerMetadata;

	if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.registration_endpoint) {
		throw new Error('OAuth metadata response is missing required endpoints');
	}

	cached = metadata;
	return metadata;
}
