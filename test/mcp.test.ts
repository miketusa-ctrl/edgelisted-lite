import { describe, expect, it } from 'vitest';
import { SUPPORTED_VERSIONS } from '../src/config';
import { TOOLS } from '../src/tools';
import { call, makeEnv, rpc } from './helpers';

const body = async (r: Response) => (await r.json()) as any;

describe('MCP endpoint (2026-07-28, stateless)', () => {
  it('server/discover advertises versions and identity', async () => {
    const { init } = rpc('server/discover');
    const r = await call('/mcp', init);
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.result.resultType).toBe('complete');
    expect(b.result.supportedVersions).toEqual(SUPPORTED_VERSIONS);
    expect(b.result._meta['io.modelcontextprotocol/serverInfo'].name).toBeTruthy();
  });

  it('tools/list returns every tool with schemas and cache hints', async () => {
    const r = await call('/mcp', rpc('tools/list').init);
    const b = await body(r);
    expect(b.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(b.result.ttlMs).toBeGreaterThan(0);
    for (const t of b.result.tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema.type).toBe('object');
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });

  it('tools/call returns structuredContent', async () => {
    const r = await call('/mcp', rpc('tools/call', { name: 'slugify', arguments: { text: 'Hello MCP World' } }).init);
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.result.isError).toBeUndefined();
    expect(b.result.structuredContent).toEqual({ slug: 'hello-mcp-world', length: 15 });
    expect(r.headers.get('x-quota-limit')).toBeNull(); // Lite: no quotas
  });

  it('bad arguments become an isError tool result, not a protocol error', async () => {
    const b = await body(await call('/mcp', rpc('tools/call', { name: 'slugify', arguments: { nope: 1 } }).init));
    expect(b.result.isError).toBe(true);
  });

  it('unknown tool -> -32602; unknown method -> 404 + -32601', async () => {
    expect((await body(await call('/mcp', rpc('tools/call', { name: 'nope', arguments: {} }).init))).error.code).toBe(-32602);
    const r = await call('/mcp', rpc('resources/list').init);
    expect(r.status).toBe(404);
    expect((await body(r)).error.code).toBe(-32601);
  });

  it('header mismatch -> 400 -32020', async () => {
    const { init } = rpc('tools/call', { name: 'slugify', arguments: { text: 'a' } }, { headers: { 'mcp-name': 'text_stats' } });
    const r = await call('/mcp', init);
    expect(r.status).toBe(400);
    expect((await body(r)).error.code).toBe(-32020);
    const r2 = await call('/mcp', rpc('tools/list', {}, { headers: { 'mcp-method': 'tools/call' } }).init);
    expect((await body(r2)).error.code).toBe(-32020);
  });

  it('accepts base64-sentinel Mcp-Name', async () => {
    const { init } = rpc('tools/call', { name: 'slugify', arguments: { text: 'a b' } }, { headers: { 'mcp-name': `=?base64?${btoa('slugify')}?=` } });
    expect((await call('/mcp', init)).status).toBe(200);
  });

  it('unsupported version -> 400 -32022 with supported list', async () => {
    const r = await call('/mcp', rpc('tools/list', {}, { version: '1999-01-01', modern: true }).init);
    expect(r.status).toBe(400);
    const b = await body(r);
    expect(b.error.code).toBe(-32022);
    expect(b.error.data.supported).toEqual(SUPPORTED_VERSIONS);
  });
});

describe('MCP endpoint (legacy initialize clients)', () => {
  it('initialize negotiates a legacy version', async () => {
    const { init } = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }, { version: '2025-06-18' });
    const b = await body(await call('/mcp', init));
    expect(b.result.protocolVersion).toBe('2025-06-18');
    expect(b.result.capabilities.tools).toBeDefined();
    const unknown = rpc('initialize', { protocolVersion: '2099-01-01' }, { version: '2025-11-25', modern: false });
    expect((await body(await call('/mcp', { ...unknown.init, headers: { 'content-type': 'application/json' } }))).result.protocolVersion).toBe('2025-11-25');
  });

  it('legacy tools/list and tools/call work without _meta and have no resultType', async () => {
    const b = await body(await call('/mcp', rpc('tools/list', {}, { version: '2025-06-18' }).init));
    expect(b.result.tools.length).toBe(TOOLS.length);
    expect(b.result.resultType).toBeUndefined();
    const c = await body(await call('/mcp', rpc('tools/call', { name: 'slugify', arguments: { text: 'one two' } }, { version: '2025-11-25' }).init));
    expect(c.result.structuredContent.slug).toBe('one-two');
  });

  it('notifications and client responses -> 202 with no body', async () => {
    const r = await call('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    expect(r.status).toBe(202);
    expect(await r.text()).toBe('');
  });
});

describe('MCP transport guards', () => {
  const post = (b: string, h: Record<string, string> = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: b });
  it('GET -> 405 with Allow', async () => {
    const r = await call('/mcp');
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST, OPTIONS');
  });
  it('parse error, batch and wrong content-type', async () => {
    expect((await call('/mcp', post('{'))).status).toBe(400);
    expect((await body(await call('/mcp', post('[]')))).error.code).toBe(-32600);
    expect((await call('/mcp', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
  });
  it('body cap -> 413', async () => {
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(40_000) } });
    expect((await call('/mcp', post(big))).status).toBe(413);
  });
  it('Origin guard', async () => {
    const ok = rpc('tools/list');
    expect((await call('/mcp', { ...ok.init, headers: { ...(ok.init.headers as object), origin: 'http://evil.example' } })).status).toBe(403);
    expect((await call('/mcp', { ...ok.init, headers: { ...(ok.init.headers as object), origin: 'null' } })).status).toBe(403);
    expect((await call('/mcp', { ...ok.init, headers: { ...(ok.init.headers as object), origin: 'http://localhost:6274' } })).status).toBe(200);
    expect((await call('/mcp', { ...ok.init, headers: { ...(ok.init.headers as object), origin: 'https://app.example' } })).status).toBe(200);
    const env = makeEnv({ MCP_ALLOWED_ORIGINS: 'https://only.example' });
    expect((await call('/mcp', { ...ok.init, headers: { ...(ok.init.headers as object), origin: 'https://app.example' } }, env)).status).toBe(403);
  });
});
