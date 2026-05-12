# @supercompany/trale-mcp-auth

OAuth helper for the Trale MCP server. Authorize once in your browser, then call Trale MCP from any agent without ever seeing a login screen again.

Designed for the **Claude Agent SDK** and any other programmatic MCP client that needs a Bearer token at runtime.

## Why this exists

The Trale MCP server uses OAuth 2.1 with Supabase as the authorization server. Access tokens expire after ~1 hour. The standard solution — and what every MCP client (Claude Code, ChatGPT, Cursor) does internally — is to use the long-lived **refresh token** to mint new access tokens on demand.

When you build with the Claude Agent SDK, the SDK does **not** run OAuth for you. You're expected to pass an access token via headers and refresh it yourself. This package handles that.

## Install

```bash
npm install @supercompany/trale-mcp-auth
# or
bun add @supercompany/trale-mcp-auth
```

## Usage

### One-time login

```bash
npx trale-mcp-auth login
```

A browser window opens, you authorize Trale once, and credentials are saved to `~/.trale/credentials.json` (mode `0600`). You won't need to do this again until you revoke access from Trale's settings.

### Use with Claude Agent SDK

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getTraleMcpConfig } from "@supercompany/trale-mcp-auth";

for await (const message of query({
  prompt: "Find action items from my last meeting with Acme Corp",
  options: {
    mcpServers: {
      trale: await getTraleMcpConfig(),
    },
  },
})) {
  console.log(message);
}
```

`getTraleMcpConfig()` reads the stored refresh token, mints a fresh access token (with in-memory caching), and returns the `mcpServers` config Claude Agent SDK expects.

### Lower-level API

```ts
import { getAccessToken, getTraleAuthHeaders } from "@supercompany/trale-mcp-auth";

const token = await getAccessToken();              // string
const headers = await getTraleAuthHeaders();       // { Authorization: 'Bearer …' }
```

## CLI

| Command | Purpose |
|---|---|
| `trale-mcp-auth login` | Run the OAuth flow and store credentials |
| `trale-mcp-auth logout` | Delete stored credentials |
| `trale-mcp-auth whoami` | Show which user is authorized |
| `trale-mcp-auth token` | Print a fresh access token (useful for piping into other tools) |
| `trale-mcp-auth refresh` | Force a token refresh (debugging) |

Pipe into shell:

```bash
curl https://app.trale.ai/api/mcp \
  -H "Authorization: Bearer $(trale-mcp-auth token)" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `TRALE_URL` | `https://app.trale.ai` | Override for self-hosted or staging deployments |
| `TRALE_CREDENTIALS_PATH` | `~/.trale/credentials.json` | Where to read/write credentials |
| `TRALE_MCP_CLIENT_NAME` | `Trale MCP CLI` | Name shown on Trale's consent screen and Connected Apps page |
| `TRALE_CALLBACK_PORT` | `53783` | Local port used for the OAuth callback during `login` |

## How it works

1. **`login`** — Dynamic Client Registration (`POST /api/mcp/register`) creates a new OAuth client. Authorization Code + PKCE flow with `offline_access` scope returns `{ access_token, refresh_token }`. Refresh token is saved to disk.
2. **`getAccessToken()`** — In-memory cache returns the access token while valid. On expiry, calls Supabase's token endpoint with `grant_type=refresh_token`. Supabase rotates the refresh token on each use, and the new one is written back to disk before the call returns.
3. **`getTraleMcpConfig()`** — Wraps the access token in the shape Claude Agent SDK expects.

Each `login` call registers a **new** OAuth client. You'll see one entry per install in Trale's Connected Apps page (Settings → Connected Apps, once available) — revoke individually as needed.

## Security notes

- The credentials file holds a long-lived refresh token. It's saved with mode `0600` on POSIX systems. **Treat it like an SSH key.**
- Refresh tokens are rotated by Supabase on every use, so a stolen-and-replayed token will lock out the legitimate copy on the next refresh — you'll notice immediately.
- Each install registers its own OAuth client via DCR. Set `TRALE_MCP_CLIENT_NAME` to something descriptive (`"Acme Slack Bot"`) so you can identify and revoke specific deployments later.
- Run `trale-mcp-auth logout` and revoke the client from Trale's Connected Apps page if a machine is compromised.

## Troubleshooting

**`Refresh failed (400)` after a while** — your refresh token was revoked (user logged out everywhere, or token was rotated by a parallel process). Run `trale-mcp-auth login` to re-authorize.

**`Timed out waiting for OAuth callback`** — the browser didn't redirect back within 5 minutes. Try again, or set `TRALE_CALLBACK_PORT` if `53783` collides.

**Headless / SSH session** — `login` requires a browser. Run it once on a machine with a browser, then copy `~/.trale/credentials.json` to your server. Or expose the OAuth URL printed to stdout, complete it elsewhere, and the local callback server will pick up the redirect (the redirect must reach `http://localhost:53783` though — SSH port-forward if needed).
