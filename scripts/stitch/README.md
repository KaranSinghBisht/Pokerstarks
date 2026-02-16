# Stitch MCP (Repo-Local Setup)

This repo includes templates for configuring the Stitch MCP server without committing secrets.

## Cursor (API Key)

1. Copy `.cursor/mcp.json.example` to `.cursor/mcp.json`
2. Replace `YOUR-API-KEY` with your Stitch API key.

Notes:
- `.cursor/` is gitignored in this repo to avoid leaking secrets.

## VSCode (API Key)

Depending on your MCP extension, the config file path may differ. This repo provides a template:

1. Copy `.vscode/mcp.json.example` to `.vscode/mcp.json`
2. Replace `YOUR-API-KEY` with your Stitch API key.

Notes:
- `.vscode/` is gitignored in this repo to avoid leaking secrets.

## OAuth Token Refresh (Optional)

If you prefer OAuth (short-lived access token), you can refresh a token into `.env`:

```bash
PROJECT_ID="your-gcp-project" ./scripts/stitch/refresh-oauth-token.sh
```

Then copy:
- `STITCH_ACCESS_TOKEN` into an `Authorization: Bearer ...` header
- `GOOGLE_CLOUD_PROJECT` into `X-Goog-User-Project`

This repo already ignores `.env` by default.

