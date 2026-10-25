/** Landing page, legal pages and llms.txt. Every external link opens in a new tab with rel="noopener noreferrer". */
import { type Env, MAX_BODY_BYTES, SERVER_DESCRIPTION, SERVER_NAME, SERVER_TITLE, SUPPORTED_VERSIONS, SUPPORT_EMAIL, VERSION } from './config';
import { escapeHtml } from './http';

/** Sales page of the paid EdgeListed Kit, linked from the landing page. */
export const PAID_KIT_URL = 'https://miketusa.gumroad.com/l/uyeuhd';
import { TOOLS } from './tools';

export const ext = (href: string, label: string) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;

export const mcpClientConfig = (origin: string) => ({ mcpServers: { [SERVER_NAME]: { type: 'http', url: `${origin}/mcp` } } });

const LAST_UPDATED = '2026-10-23';

const shell = (title: string, body: string, origin: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(SERVER_DESCRIPTION)}">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<link rel="service-desc" type="application/json" href="/openapi.json" title="OpenAPI 3.1">
<link rel="canonical" href="${escapeHtml(origin)}/">
<style>
:root{color-scheme:light dark;--fg:#1d2330;--bg:#fbfbfd;--mut:#5b6475;--card:#fff;--line:#e3e6ee;--acc:#2456d6}
@media (prefers-color-scheme:dark){:root{--fg:#e8ebf2;--bg:#11141a;--mut:#9aa3b5;--card:#181c24;--line:#2a3040;--acc:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
.wrap{max-width:820px;margin:0 auto;padding:24px}h1{font-size:1.8rem;margin:.2em 0}a{color:var(--acc)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
pre{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto}code{font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
.small{color:var(--mut);font-size:.9rem}footer{border-top:1px solid var(--line);margin-top:32px;padding-top:12px}
@media (max-width:560px){#mcp-config{white-space:pre-wrap;word-break:break-all}}
</style></head><body><main class="wrap">${body}
<footer class="small"><a href="/">Home</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">OpenAPI</a> · v${VERSION} · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
</main></body></html>`;

export function landingPage(origin: string, env: Env): string {
  const cfg = JSON.stringify(mcpClientConfig(origin), null, 2);
  const tools = TOOLS.map((t) => `<li><code>${t.name}</code> – ${escapeHtml(t.description)}</li>`).join('');
  return shell(
    SERVER_TITLE,
    `<h1>${escapeHtml(SERVER_TITLE)}</h1>
<p>${escapeHtml(SERVER_DESCRIPTION)}</p>
<section class="card"><h2>Tools</h2><ul>${tools}</ul></section>
<section id="agents" class="card"><h2>For AI agents (MCP)</h2>
<p>This is a remote ${ext('https://modelcontextprotocol.io/', 'Model Context Protocol')} server over Streamable HTTP. Many MCP clients accept the config below; some use a different format (for example, VS Code uses a <code>servers</code> key). Clients with a settings screen only need the URL <code>${escapeHtml(origin)}/mcp</code>.</p>
<pre><code id="mcp-config">${escapeHtml(cfg)}</code></pre>
<p class="small">Protocol versions: ${SUPPORTED_VERSIONS.join(', ')}. Machine-readable docs: <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">OpenAPI 3.1</a></p></section>
<section class="card"><h2>JSON API</h2>
<pre><code>curl -s -X POST ${escapeHtml(origin)}/v1/tools/slugify \\
  -H 'content-type: application/json' \\
  -d '{"text":"Hello World"}'</code></pre></section>
<section class="card"><h2>Limits</h2><p>Request bodies up to ${MAX_BODY_BYTES / 1024} KB. This Lite edition has no API keys or quotas; add your own protection before heavy public use.</p>
<p class="small">Need keys, daily quotas, rate limits and a listing guide? See ${ext(PAID_KIT_URL, 'EdgeListed Kit')}. Questions: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p></section>`,
    origin,
  );
}

export function privacyPage(origin: string): string {
  return shell(
    `Privacy – ${SERVER_TITLE}`,
    `<h1>Privacy</h1><p class="small">Last updated ${LAST_UPDATED}</p>
<p>The text and parameters you send to the tools are processed in memory to produce the response and are not stored or logged by this service.</p>
<h2>What is stored</h2><p>Nothing. This service keeps no database and stores no request content, IP addresses or identifiers.</p>
<h2>Infrastructure</h2><p>The service runs on ${ext('https://www.cloudflare.com/privacypolicy/', 'Cloudflare Workers')}, which processes connection data (such as IP addresses) to deliver and protect the service under its own privacy policy.</p>
<h2>No tracking</h2><p>No cookies, no analytics scripts, no advertising, and no data sales.</p>
<h2>Contact</h2><p><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
    origin,
  );
}

export function termsPage(origin: string): string {
  return shell(
    `Terms – ${SERVER_TITLE}`,
    `<h1>Terms of use</h1><p class="small">Last updated ${LAST_UPDATED}</p>
<ol>
<li><b>The service.</b> ${escapeHtml(SERVER_TITLE)} provides utility tools over an MCP endpoint and a JSON API. Features and limits may change.</li>
<li><b>Acceptable use.</b> Do not overload the service, probe it for vulnerabilities without permission, or use it for unlawful purposes.</li>
<li><b>API keys.</b> Keep your key private. You are responsible for calls made with it.</li>
<li><b>No warranty.</b> The service is provided "as is" without warranties of any kind. Results (such as time-zone conversions) depend on runtime data and may contain errors; verify anything important.</li>
<li><b>Liability.</b> To the extent permitted by law, the operator is not liable for indirect or consequential damages arising from use of the service.</li>
<li><b>Trademarks.</b> Names of AI assistants or platforms mentioned anywhere on this site are used only to describe compatibility. This service is not affiliated with or endorsed by their owners.</li>
<li><b>Contact.</b> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></li>
</ol>`,
    origin,
  );
}

export function llmsTxt(origin: string, env: Env): string {
  return `# ${SERVER_TITLE}

> ${SERVER_DESCRIPTION} Remote MCP server plus a JSON API described by OpenAPI 3.1.

## For AI agents

- [MCP server](${origin}/mcp): remote MCP over Streamable HTTP (POST only, stateless, JSON responses). Protocol versions: ${SUPPORTED_VERSIONS.join(', ')}. Client config (many MCP clients accept this; some use a different format, for example VS Code uses a \`servers\` key): \`${JSON.stringify(mcpClientConfig(origin))}\`
- [OpenAPI 3.1 spec](${origin}/openapi.json): machine-readable description of the JSON API

## Tools

${TOOLS.map((t) => `- \`${t.name}\` (MCP tool; also \`POST ${origin}/v1/tools/${t.name}\`): ${t.description}`).join('\n')}

## Limits

- Request bodies up to ${MAX_BODY_BYTES} bytes. No API keys or quotas in this Lite edition.
- Errors: { "error": { "code", "message" } } with codes invalid_json, invalid_arguments, body_too_large, unsupported_media_type.

## Optional

- [Privacy](${origin}/privacy)
- [Terms](${origin}/terms)
- Contact: ${SUPPORT_EMAIL}
`;
}
