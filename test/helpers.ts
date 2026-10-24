import worker from '../src/index';
import type { Env } from '../src/config';

export class MemoryKV {
  store = new Map<string, string>();
  puts = 0;
  async get(key: string, type?: string): Promise<unknown> {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string): Promise<void> {
    this.puts++;
    this.store.set(key, value);
  }
}

export class FakeLimiter {
  counts = new Map<string, number>();
  constructor(public max: number) {}
  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return { success: n <= this.max };
  }
}

export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, flush: () => Promise.all(pending) };
}

export function makeEnv(over: Partial<Env> = {}): Env & { KV: MemoryKV; RL_ANON: FakeLimiter; RL_KEYED: FakeLimiter } {
  return {
    KV: new MemoryKV(),
    RL_ANON: new FakeLimiter(30),
    RL_KEYED: new FakeLimiter(120),
    QUOTA_SALT: 'test-quota-salt',
    ...over,
  } as unknown as Env & { KV: MemoryKV; RL_ANON: FakeLimiter; RL_KEYED: FakeLimiter };
}

export const BASE = 'https://example.test';

export async function call(path: string, init: RequestInit = {}, env: Env = makeEnv(), ip = '203.0.113.7') {
  const { ctx, flush } = makeCtx();
  const headers = new Headers(init.headers);
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', ip);
  const res = await worker.fetch(new Request(BASE + path, { ...init, headers }), env as never, ctx);
  await flush();
  return res;
}

let n = 0;
export function rpc(method: string, params: Record<string, unknown> = {}, opts: { version?: string; modern?: boolean; headers?: Record<string, string> } = {}) {
  const id = ++n;
  const version = opts.version ?? '2026-07-28';
  const modern = opts.modern ?? version === '2026-07-28';
  const p = modern ? { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': version, 'io.modelcontextprotocol/clientCapabilities': {} } } : params;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': version,
    ...(modern ? { 'mcp-method': method } : {}),
    ...(modern && method === 'tools/call' ? { 'mcp-name': String(params.name) } : {}),
    ...opts.headers,
  };
  return { id, init: { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: p }) } as RequestInit };
}
