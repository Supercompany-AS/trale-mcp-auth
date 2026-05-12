export const DEFAULT_TRALE_URL = 'https://app.trale.ai';

export const TRALE_URL = process.env.TRALE_URL ?? DEFAULT_TRALE_URL;

export const MCP_ENDPOINT = `${TRALE_URL}/api/mcp`;
export const DCR_ENDPOINT = `${TRALE_URL}/api/mcp/register`;
export const AUTH_SERVER_METADATA_URL = `${TRALE_URL}/.well-known/oauth-authorization-server`;

export const CLIENT_NAME = process.env.TRALE_MCP_CLIENT_NAME ?? 'Trale MCP CLI';

export const CALLBACK_PORT = Number(process.env.TRALE_CALLBACK_PORT ?? 53783);
export const CALLBACK_PATH = '/callback';
export const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

export const DEFAULT_SCOPES = ['openid', 'email', 'profile'];

export const ACCESS_TOKEN_SAFETY_WINDOW_SECONDS = 60;
