import { MCP_ENDPOINT } from './config.js';
import { getAccessToken } from './refresh.js';

export interface TraleMcpHttpConfig {
	type: 'http';
	url: string;
	headers: Record<string, string>;
}

/**
 * Returns an MCP server config ready to drop into Claude Agent SDK's `mcpServers`.
 *
 * @example
 * ```ts
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 * import { getTraleMcpConfig } from '@trale/mcp-auth';
 *
 * for await (const msg of query({
 *   prompt: '...',
 *   options: { mcpServers: { trale: await getTraleMcpConfig() } },
 * })) { ... }
 * ```
 */
export async function getTraleMcpConfig(): Promise<TraleMcpHttpConfig> {
	const accessToken = await getAccessToken();
	return {
		type: 'http',
		url: MCP_ENDPOINT,
		headers: { Authorization: `Bearer ${accessToken}` },
	};
}

/**
 * Returns just the headers, for callers that build their own MCP config shape.
 */
export async function getTraleAuthHeaders(): Promise<Record<string, string>> {
	const accessToken = await getAccessToken();
	return { Authorization: `Bearer ${accessToken}` };
}
