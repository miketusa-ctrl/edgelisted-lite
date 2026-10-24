/**
 * Minimal, dependency-free MCP server over Streamable HTTP (POST /mcp, JSON responses, stateless).
 *
 * Speaks the 2026-07-28 revision (per-request _meta, server/discover, Mcp-Method / Mcp-Name
 * header validation, resultType) and the legacy initialize-handshake revisions
 * 2025-11-25, 2025-06-18 and 2025-03-26, so older clients keep working.
 * No sessions, no server-initiated messages, no SSE: every request gets one JSON response.
 */
import { type Env, MAX_BODY_BYTES, MODERN_VERSION, LEGACY_VERSIONS, SERVER_DESCRIPTION, SERVER_NAME, SERVER_TITLE, SUPPORTED_VERSIONS, VERSION } from './config';
import { BodyTooLargeError, SECURITY_HEADERS, readCapped } from './http';
import { TOOLS, ToolInputError, findTool, publishedInputSchema, validateArgs } from './tools';

type Id = string | number;
type JsonRpcError = { jsonrpc: '2.0'; id: Id | null; error: { code: number; message: string; data?: unknown } };

export const MCP_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, x-api-key, mcp-protocol-version, mcp-method, mcp-name',
  'access-control-expose-headers': 'mcp-protocol-version',
  'access-control-max-age': '86400',
};

export const SERVER_INFO = { name: SERVER_NAME, title: SERVER_TITLE, version: VERSION };
const CAPABILITIES = { tools: { listChanged: false } };

export function instructions(_env: Env): string {
  return `${SERVER_DESCRIPTION} All tools are read-only and keep no data.`;
}

const err = (id: Id | null | undefined, code: number, message: string, data?: unknown): JsonRpcError => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});
const isId = (v: unknown): v is Id => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { 'content-type': 'application/json' }),
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
      ...MCP_CORS,
      ...headers,
    },
  });
}

/** DNS-rebinding guard: allow no Origin, same origin, https origins, localhost; optional allowlist. */
export function originAllowed(origin: string | null, selfOrigin: string, env: Env): boolean {
  if (origin === null) return true;
  const allow = (env.MCP_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length) return origin === selfOrigin || allow.includes(origin);
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (origin === 'null' || u.origin !== origin) return false;
  if (origin === selfOrigin || u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

/** Mcp-Name may be sent as =?base64?<b64>?= when the value is not plain ASCII. */
export function decodeHeaderValue(v: string): string {
  const m = /^=\?base64\?([A-Za-z0-9+/=]*)\?=$/.exec(v);
  if (!m) return v;
  try {
    const bin = atob(m[1] ?? '');
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '\u0000invalid';
  }
}

export function toolsForListing() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: publishedInputSchema(t),
    outputSchema: t.outputSchema,
    annotations: { title: t.title, ...t.annotations },
  }));
}

export async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const selfOrigin = new URL(request.url).origin;
  if (request.method === 'OPTIONS') return reply(204, null);
  if (request.method !== 'POST') return reply(405, err(null, -32600, 'Use POST for MCP requests.'), { allow: 'POST, OPTIONS' });
  if (!originAllowed(request.headers.get('origin'), selfOrigin, env)) return reply(403, err(null, -32600, 'Origin not allowed'));

  const ct = (request.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('application/json')) return reply(415, err(null, -32700, 'Content-Type must be application/json'));
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
    return reply(406, err(null, -32600, 'Accept must include application/json'));
  }

  let raw: string;
  try {
    raw = await readCapped(request, MAX_BODY_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return reply(413, err(null, -32600, `Request body too large (max ${MAX_BODY_BYTES} bytes)`));
    return reply(400, err(null, -32700, 'Could not read request body'));
  }
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return reply(400, err(null, -32700, 'Parse error'));
  }
  if (Array.isArray(msg)) return reply(400, err(null, -32600, 'JSON-RPC batches are not supported; send one message per POST'));
  if (!msg || typeof msg !== 'object') return reply(400, err(null, -32600, 'Invalid Request'));
  const m = msg as Record<string, unknown>;

  // Client JSON-RPC responses and notifications: accepted, nothing to return.
  if (m.jsonrpc === '2.0' && m.method === undefined && isId(m.id) && ('result' in m || 'error' in m)) return reply(202, null);
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return reply(400, err(isId(m.id) ? m.id : null, -32600, 'Invalid Request'));
  if (!Object.hasOwn(m, 'id')) return reply(202, null);
  if (!isId(m.id)) return reply(400, err(null, -32600, 'Invalid Request: id must be a string or number'));
  const id = m.id;
  const method = m.method;
  const params = (m.params ?? {}) as Record<string, unknown>;
  if (typeof params !== 'object' || Array.isArray(params)) return reply(400, err(id, -32602, 'params must be an object'));

  // ---- Protocol era & header validation ----
  const hv = request.headers.get('mcp-protocol-version');
  const meta = (params._meta && typeof params._meta === 'object' ? params._meta : {}) as Record<string, unknown>;
  const pv = meta['io.modelcontextprotocol/protocolVersion'];
  let version: string;

  if (method === 'initialize') {
    const asked = params.protocolVersion;
    version = typeof asked === 'string' && (LEGACY_VERSIONS as readonly string[]).includes(asked) ? asked : LEGACY_VERSIONS[0];
    return reply(200, {
      jsonrpc: '2.0',
      id,
      result: { protocolVersion: version, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: instructions(env) },
    });
  }

  if (typeof pv === 'string') {
    if (hv !== pv) return reply(400, err(id, -32020, `Header mismatch: MCP-Protocol-Version header '${String(hv).slice(0, 40)}' does not match _meta protocolVersion`));
    if (!SUPPORTED_VERSIONS.includes(pv)) return reply(400, err(id, -32022, 'Unsupported protocol version', { supported: SUPPORTED_VERSIONS, requested: pv.slice(0, 40) }));
    version = pv;
  } else if (hv) {
    if (!SUPPORTED_VERSIONS.includes(hv)) return reply(400, err(id, -32022, 'Unsupported protocol version', { supported: SUPPORTED_VERSIONS, requested: hv.slice(0, 40) }));
    if (hv === MODERN_VERSION && method !== 'server/discover') {
      return reply(400, err(id, -32020, 'Header mismatch: _meta io.modelcontextprotocol/protocolVersion is required'));
    }
    version = hv;
  } else {
    version = '2025-03-26'; // pre-header clients
  }
  const modern = version === MODERN_VERSION;

  if (modern) {
    const hm = request.headers.get('mcp-method');
    if (hm !== method) return reply(400, err(id, -32020, `Header mismatch: Mcp-Method header must equal '${method.slice(0, 60)}'`));
    if (method === 'tools/call') {
      const hn = request.headers.get('mcp-name');
      if (hn === null || decodeHeaderValue(hn) !== params.name) {
        return reply(400, err(id, -32020, 'Header mismatch: Mcp-Name header must equal params.name'));
      }
    }
  }

  const done = (result: Record<string, unknown>, headers: Record<string, string> = {}) =>
    reply(
      200,
      {
        jsonrpc: '2.0',
        id,
        result: modern ? { resultType: 'complete', ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO, ...((result._meta as object) ?? {}) } } : result,
      },
      { 'mcp-protocol-version': version, ...headers },
    );

  try {
    switch (method) {
      case 'server/discover':
        return done({ supportedVersions: SUPPORTED_VERSIONS, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: instructions(env), ttlMs: 3_600_000, cacheScope: 'public' });
      case 'ping':
        return done({});
      case 'tools/list':
        return done(modern ? { tools: toolsForListing(), ttlMs: 3_600_000, cacheScope: 'public' } : { tools: toolsForListing() });
      case 'tools/call':
        return await callTool(id, params, request, env, ctx, done);
      default:
        return reply(modern ? 404 : 200, err(id, -32601, 'Method not found'), { 'mcp-protocol-version': version });
    }
  } catch {
    return reply(500, err(id, -32603, 'Internal error')); // never leak a stack trace
  }
}

async function callTool(
  id: Id,
  params: Record<string, unknown>,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  done: (r: Record<string, unknown>, h?: Record<string, string>) => Response,
): Promise<Response> {
  const tool = findTool(params.name);
  if (!tool) return reply(200, err(id, -32602, `Unknown tool: ${String(params.name).slice(0, 60)}`));

  let args: Record<string, unknown>;
  try {
    args = validateArgs(tool, params.arguments);
  } catch (e) {
    if (e instanceof ToolInputError) return done({ content: [{ type: 'text', text: e.message }], isError: true });
    throw e;
  }


  try {
    const out = tool.run(args);
    return done({ content: [{ type: 'text', text: tool.summarize(out) }, { type: 'text', text: JSON.stringify(out) }], structuredContent: out });
  } catch (e) {
    if (e instanceof ToolInputError) return done({ content: [{ type: 'text', text: e.message }], isError: true });
    throw e;
  }
}
