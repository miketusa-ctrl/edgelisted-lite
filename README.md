# EdgeListed Lite: a minimal MCP + OpenAPI server on Cloudflare Workers

EdgeListed Lite is a free, MIT-licensed Cloudflare Worker. It serves **one tool** (`slugify`) in two ways from a single definition:

- `POST /mcp`: a remote MCP server over Streamable HTTP. It speaks the stateless 2026-07-28 revision and falls back to `initialize` for 2025-11-25, 2025-06-18 and 2025-03-26 clients.
- `GET /openapi.json`: an OpenAPI 3.1 document, with `POST /v1/tools/slugify` as the matching JSON endpoint.

It also serves a landing page, `/privacy`, `/terms`, `/llms.txt` and `/health`. There are no runtime dependencies and no bindings.

```bash
npm install
npm test                 # tsc + vitest, offline
npx wrangler dev         # wrangler 4.x needs Node 22+
BASE_URL=http://localhost:8787 npm run smoke   # optional: SMOKE_TRAFFIC_HEADER=x-my-tag to tag your own checks
npx wrangler deploy      # needs your own Cloudflare account
```

**Before deploying:**
- Edit `SERVER_NAME`, `SERVER_TITLE`, `SERVER_DESCRIPTION` and `SUPPORT_EMAIL` in `src/config.ts`, and `PAID_KIT_URL` in `src/pages.ts`.
- Rewrite `/privacy` and `/terms` for your service. They are starting points, not legal advice.
- **Lite has no API keys, quotas or rate limits.** Add your own protection (for example Cloudflare WAF rate-limiting rules) before heavy public use.

To add a tool, add an entry to `TOOLS` in `src/tools.ts`. It then appears in MCP `tools/list`, in `/openapi.json`, under `/v1/tools/<name>` and on the landing page.

## Lite vs. the paid kit

| | Lite (this repo) | EdgeListed Kit (paid) |
|---|---|---|
| MCP (2026-07-28 + legacy) and OpenAPI 3.1 from one source | ✓ | ✓ |
| Example tools | 1 | 3 |
| API keys, KV daily quotas, Rate Limiting bindings | – | ✓ |
| Privacy-preserving unique-visitor counter | – | ✓ |
| Glama and MCP Registry verification files, `server.json` template | – | ✓ |
| Listing Playbook (MCP Registry, Glama, Smithery, mcp.so and more) | – | ✓ |

The paid kit (Solo $39, Team/Agency $89, one-time purchase, USD; 14-day no-questions refund) is at `<PAID_KIT_URL>` (placeholder; the real link will be added at launch). For questions, email digitalpromohub.support@gmail.com.

This project works with MCP clients that support remote Streamable HTTP servers. EdgeListed Lite is part of the EdgeListed Kit family. EdgeListed Kit is unofficial and not affiliated with or endorsed by Cloudflare, Anthropic, OpenAI, Anysphere, the Model Context Protocol project, Glama, Smithery, or any other directory named here.

## CORS

Responses send `access-control-allow-origin: *` by default. That suits a public, read-only API where callers authenticate with an API key rather than cookies. If only your own web app should call the API from a browser, narrow it: change `access-control-allow-origin` in `API_CORS` (`src/http.ts`) and `MCP_CORS` (`src/mcp.ts`) to your exact origin (for example `https://app.example.com`) and add `vary: Origin`, or read the allowed origin from a `[vars]` entry in `wrangler.toml`. CORS only affects browsers; server-side clients and MCP clients are unaffected, so add your own auth and rate limits if you need them.

## License

MIT. See `LICENSE`.
