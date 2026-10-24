/// <reference types="node" />
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_VERSIONS, SUPPORT_EMAIL } from '../src/config';
import { TOOLS } from '../src/tools';
import { BASE, call } from './helpers';

describe('pages and docs', () => {
  it('landing, privacy, terms, health, robots return 200', async () => {
    for (const p of ['/', '/privacy', '/terms', '/health', '/robots.txt', '/llms.txt', '/openapi.json']) {
      expect((await call(p)).status, p).toBe(200);
    }
    expect(await (await call('/health')).json()).toMatchObject({ ok: true });
    expect((await call('/nope')).status).toBe(404);
    expect((await call('/llms.txt', { method: 'POST' })).status).toBe(405);
  });

  it('every external link opens in a new tab with rel=noopener', async () => {
    for (const p of ['/', '/privacy', '/terms']) {
      const h = await (await call(p)).text();
      const anchors = h.match(/<a\s[^>]*href="https?:[^"]*"[^>]*>/g) ?? [];
      for (const a of anchors) {
        expect(a, `${p}: ${a}`).toContain('target="_blank"');
        expect(a, `${p}: ${a}`).toMatch(/rel="[^"]*noopener/);
      }
    }
  });

  it('landing page has the MCP config, doc links and support email', async () => {
    const h = await (await call('/')).text();
    expect(h).toContain(`${BASE}/mcp`);
    expect(h).toContain('href="/llms.txt"');
    expect(h).toContain('rel="service-desc"');
    expect(h).toContain(SUPPORT_EMAIL);
    expect(h).not.toMatch(/\bany MCP client|\bofficial\b|endorsed by/i);
  });

  it('llms.txt lists every tool and protocol version', async () => {
    const t = await (await call('/llms.txt')).text();
    expect(t.startsWith('# ')).toBe(true);
    for (const tool of TOOLS) expect(t).toContain(`\`${tool.name}\``);
    for (const v of SUPPORTED_VERSIONS) expect(t).toContain(v);
  });

  it('OpenAPI 3.1 is generated from the same tool definitions', async () => {
    const spec = (await (await call('/openapi.json')).json()) as any;
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe(BASE);
    for (const tool of TOOLS) {
      const op = spec.paths[`/v1/tools/${tool.name}`].post;
      expect(op.operationId).toBe(tool.name);
      expect(Object.keys(op.requestBody.content['application/json'].schema.properties)).toEqual(Object.keys(tool.inputSchema.properties!));
      expect(op.responses['200'].content['application/json'].schema).toEqual(tool.outputSchema);
    }
    expect(spec.paths['/mcp'].post).toBeDefined();
    // every $ref resolves
    const refs = JSON.stringify(spec).match(/"#\/components\/schemas\/[^"]+"/g) ?? [];
    for (const r of refs) expect(spec.components.schemas[r.slice(22, -1)]).toBeDefined();
  });
});

describe('wrangler.toml', async () => {
  const toml = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
  it('needs no bindings and contains no IDs or secrets', () => {
    expect(toml).not.toMatch(/kv_namespaces|ratelimits|account_id/);
    expect(toml).not.toMatch(/[0-9a-f]{32}/i);
  });
});

describe('repository hygiene', () => {
  it('source has no personal emails or workers.dev hostnames', async () => {
    for (const dir of ['../src/', '../scripts/']) {
      for (const f of await readdir(new URL(dir, import.meta.url))) {
        const s = await readFile(new URL(dir + f, import.meta.url), 'utf8');
        expect(s, f).not.toMatch(/[\w.-]+\.workers\.dev/);
        for (const e of s.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []) expect(e, f).toBe(SUPPORT_EMAIL);
      }
    }
  });
});
