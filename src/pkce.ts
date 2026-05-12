import { createHash, randomBytes } from 'node:crypto';

function base64UrlEncode(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
	return base64UrlEncode(randomBytes(32));
}

export function codeChallenge(verifier: string): string {
	return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

export function randomState(): string {
	return base64UrlEncode(randomBytes(16));
}
