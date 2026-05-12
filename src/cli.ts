#!/usr/bin/env node
import { credentialsPath, deleteCredentials, loadCredentials } from './credentials.js';
import { login } from './oauth.js';
import { clearAccessTokenCache, getAccessToken } from './refresh.js';

const HELP = `trale-mcp-auth — OAuth helper for Trale MCP

Usage:
  trale-mcp-auth login        Run the OAuth flow and store credentials
  trale-mcp-auth logout       Delete stored credentials
  trale-mcp-auth whoami       Show which user is currently authorized
  trale-mcp-auth token        Print a fresh access token (for scripting)
  trale-mcp-auth refresh      Force a refresh (debug)
  trale-mcp-auth --help       Show this help

Credentials path: ${credentialsPath()}
Override via TRALE_CREDENTIALS_PATH.
`;

function decodeJwtSub(token: string): string | null {
	try {
		const [, payload] = token.split('.');
		if (!payload) return null;
		const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
			sub?: string;
			email?: string;
		};
		return decoded.email ?? decoded.sub ?? null;
	} catch {
		return null;
	}
}

async function cmdLogin(): Promise<void> {
	const creds = await login();
	console.log(`Authorized. Credentials saved to ${credentialsPath()}`);
	// Mint an access token immediately so we surface any token-endpoint issues now.
	const token = await getAccessToken();
	const who = decodeJwtSub(token);
	if (who) console.log(`Logged in as: ${who}`);
	console.log(`Client ID: ${creds.clientId}`);
}

async function cmdLogout(): Promise<void> {
	const deleted = await deleteCredentials();
	clearAccessTokenCache();
	console.log(deleted ? 'Credentials deleted.' : 'No credentials file found.');
}

async function cmdWhoami(): Promise<void> {
	const creds = await loadCredentials();
	if (!creds) {
		console.log('Not logged in. Run: trale-mcp-auth login');
		process.exit(1);
	}
	const token = await getAccessToken();
	const who = decodeJwtSub(token);
	console.log(`User: ${who ?? '(unknown)'}`);
	console.log(`Client ID: ${creds.clientId}`);
	console.log(`Trale URL: ${creds.traleUrl}`);
	console.log(`Authorized at: ${creds.createdAt}`);
}

async function cmdToken(): Promise<void> {
	const token = await getAccessToken();
	process.stdout.write(token + '\n');
}

async function cmdRefresh(): Promise<void> {
	clearAccessTokenCache();
	const token = await getAccessToken();
	const who = decodeJwtSub(token);
	console.log(`Refreshed. Token sub: ${who ?? '(unknown)'}`);
}

async function main(): Promise<void> {
	const [, , cmd] = process.argv;

	if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
		console.log(HELP);
		return;
	}

	switch (cmd) {
		case 'login':
			return cmdLogin();
		case 'logout':
			return cmdLogout();
		case 'whoami':
			return cmdWhoami();
		case 'token':
			return cmdToken();
		case 'refresh':
			return cmdRefresh();
		default:
			console.error(`Unknown command: ${cmd}\n`);
			console.log(HELP);
			process.exit(1);
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
