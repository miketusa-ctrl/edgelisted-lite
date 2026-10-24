import { type Env, MAX_BODY_BYTES, VERSION } from './config';
import { API_CORS, BodyTooLargeError, apiError, html, json, readCapped, text } from './http';
import { handleMcp } from './mcp';
import { openApiSpec } from './openapi';
import { landingPage, llmsTxt, privacyPage, termsPage } from './pages';
import { ToolInputError, findTool, validateArgs } from './tools';

const DOC_CACHE = { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' };

function getOnly(request: Request, make: () => Response): Response {
  if (request.method === 'GET') return make();
  if (request.method === 'HEAD') {
    const r = make();
    return new Response(null, { status: r.status, headers: r.headers });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, HEAD, OPTIONS', ...API_CORS } });
  return apiError(405, 'method_not_allowed', 'Method not allowed.', { allow: 'GET, HEAD, OPTIONS' });
}

async function handleToolRoute(name: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_CORS });
  if (request.method !== 'POST') return apiError(405, 'method_not_allowed', 'Use POST with a JSON body.', { allow: 'POST, OPTIONS' });
  const tool = findTool(name);
  if (!tool) return apiError(404, 'not_found', 'Unknown tool.');
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return apiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  let body: unknown;
  try {
    body = JSON.parse((await readCapped(request, MAX_BODY_BYTES)) || '{}');
  } catch (e) {
    if (e instanceof BodyTooLargeError) return apiError(413, 'body_too_large', `Request body too large (max ${MAX_BODY_BYTES} bytes).`);
    return apiError(400, 'invalid_json', 'Body must be valid JSON.');
  }
  let args: Record<string, unknown>;
  try {
    args = validateArgs(tool, body);
  } catch (e) {
    if (e instanceof ToolInputError) return apiError(400, 'invalid_arguments', e.message);
    throw e;
  }
  try {
    return json(tool.run(args), 200, { ...API_CORS, 'cache-control': 'no-store' });
  } catch (e) {
    if (e instanceof ToolInputError) return apiError(400, 'invalid_arguments', e.message);
    throw e;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = url.origin;
    try {
      if (path === '/mcp') return await handleMcp(request, env, ctx);
      if (path.startsWith('/v1/tools/')) return await handleToolRoute(path.slice('/v1/tools/'.length), request, env, ctx);

      switch (path) {
        case '/':
          return getOnly(request, () => html(landingPage(origin, env)));
        case '/privacy':
          return getOnly(request, () => html(privacyPage(origin)));
        case '/terms':
          return getOnly(request, () => html(termsPage(origin)));
        case '/llms.txt':
          return getOnly(request, () => text(llmsTxt(origin, env), 'text/plain; charset=utf-8', DOC_CACHE));
        case '/openapi.json':
          return getOnly(request, () => json(openApiSpec(origin, env), 200, DOC_CACHE));
        case '/health':
          return getOnly(request, () => json({ ok: true, version: VERSION }, 200, { 'cache-control': 'no-store' }));
        case '/robots.txt':
          return getOnly(request, () => text('User-agent: *\nAllow: /\n', 'text/plain; charset=utf-8', DOC_CACHE));
        default:
          return apiError(404, 'not_found', 'Not found. See /openapi.json or /llms.txt.');
      }
    } catch {
      return apiError(500, 'internal_error', 'Internal error.');
    }
  },
} satisfies ExportedHandler<Env>;
