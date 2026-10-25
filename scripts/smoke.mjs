#!/usr/bin/env node
/**
 * Smoke test against a running deployment (or `wrangler dev`).
 *
 *   BASE_URL=http://127.0.0.1:8787 npm run smoke
 *   BASE_URL=https://<your-worker>.<your-subdomain>.workers.dev npm run smoke
 *
 * Optional traffic tag, so your own checks can be filtered out of your logs:
 *   SMOKE_TRAFFIC_HEADER  header name  (default: none, so no tag is sent)
 *   SMOKE_TRAFFIC_VALUE   header value (default: 1)
 *   SMOKE_API_KEY         optional API key to exercise the keyed path
 * Exits non-zero on the first failed check. Uses only Node 20+ built-ins.
 */
const BASE = (process.env.BASE_URL || process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const TAG_NAME = process.env.SMOKE_TRAFFIC_HEADER ?? '';
const TAG_VALUE = process.env.SMOKE_TRAFFIC_VALUE ?? '1';
const KEY = process.env.SMOKE_API_KEY || '';
const V = '2026-07-28';

const baseHeaders = { 'user-agent': 'edgelisted-smoke/0.1.3', ...(TAG_NAME ? { [TAG_NAME]: TAG_VALUE } : {}), ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) };
let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};
const req = (path, init = {}) => fetch(BASE + path, { ...init, headers: { ...baseHeaders, ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
const mcp = (method, params = {}) =>
  req('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': V, 'mcp-method': method, ...(params.name ? { 'mcp-name': params.name } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': V, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
  });

console.log(`Smoke: ${BASE}  (traffic tag: ${TAG_NAME ? `${TAG_NAME}: ${TAG_VALUE}` : 'none'})`);
try {
  const h = await req('/health');
  check(h.status === 200 && (await h.json()).ok === true, 'GET /health');
  for (const p of ['/', '/privacy', '/terms', '/llms.txt']) check((await req(p)).status === 200, `GET ${p}`);
  const spec = await (await req('/openapi.json')).json();
  check(spec.openapi === '3.1.0', 'GET /openapi.json is OpenAPI 3.1');
  const d = await (await mcp('server/discover')).json();
  check(Array.isArray(d.result?.supportedVersions), 'MCP server/discover');
  const l = await (await mcp('tools/list')).json();
  const names = (l.result?.tools || []).map((t) => t.name);
  check(names.length > 0, 'MCP tools/list', names.join(', '));
  const c = await (await mcp('tools/call', { name: 'slugify', arguments: { text: 'Smoke Test OK' } })).json();
  check(c.result?.structuredContent?.slug === 'smoke-test-ok', 'MCP tools/call slugify');
  const r = await req('/v1/tools/slugify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'one two three' }) });
  check(r.status === 200 && (await r.json()).slug === 'one-two-three', 'POST /v1/tools/slugify');
  check((await req('/mcp')).status === 405, 'GET /mcp -> 405');
} catch (e) {
  check(false, 'request failed', String(e?.message || e));
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
