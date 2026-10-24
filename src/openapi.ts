/** OpenAPI 3.1 document generated from TOOLS, so the REST docs never drift from MCP. */
import { type Env, MAX_BODY_BYTES, SERVER_DESCRIPTION, SERVER_TITLE, SUPPORT_EMAIL, VERSION } from './config';
import { TOOLS, publishedInputSchema } from './tools';

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } },
  required: ['error'],
};
const errRef = (description: string, headers?: Record<string, unknown>) => ({
  description,
  ...(headers ? { headers } : {}),
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

export function openApiSpec(origin: string, env: Env) {
  const paths: Record<string, unknown> = {};
  for (const t of TOOLS) {
    const example = Object.fromEntries(
      Object.entries(t.inputSchema.properties ?? {})
        .filter(([, s]) => s.examples?.length)
        .map(([k, s]) => [k, s.examples?.[0]]),
    );
    paths[`/v1/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description: `${t.description} Same engine as the MCP tool \`${t.name}\`.`,
        tags: ['tools'],
        requestBody: { required: true, content: { 'application/json': { schema: publishedInputSchema(t), example } } },
        responses: {
          '200': { description: 'Result', content: { 'application/json': { schema: t.outputSchema } } },
          '400': errRef('Invalid JSON or arguments (code: invalid_json, invalid_arguments)'),
          '413': errRef(`Body larger than ${MAX_BODY_BYTES} bytes (code: body_too_large)`),
          '415': errRef('Content-Type is not application/json (code: unsupported_media_type)'),
          '503': errRef('Rate limiter not configured (code: limiter_unavailable)'),
        },
      },
    };
  }

  paths['/mcp'] = {
    post: {
      operationId: 'mcp',
      summary: 'Remote MCP endpoint (Streamable HTTP, JSON-RPC 2.0)',
      description: 'Model Context Protocol endpoint. One JSON-RPC message per POST; JSON responses; stateless (no sessions).',
      tags: ['mcp'],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'JSON-RPC 2.0 request or notification' } } } },
      responses: {
        '200': { description: 'JSON-RPC response', content: { 'application/json': { schema: { type: 'object' } } } },
        '202': { description: 'Notification or client response accepted (no body)' },
        '400': { description: 'Parse error, invalid request, header mismatch (-32020) or unsupported protocol version (-32022)' },
        '403': { description: 'Origin not allowed' },
        '404': { description: 'Method not found (2026-07-28 clients)' },
        '406': { description: 'Accept header excludes application/json' },
        '413': { description: 'Body too large' },
        '415': { description: 'Content-Type is not application/json' },
        '500': { description: 'Internal error (-32603)' },
      },
    },
    get: { operationId: 'mcpGet', summary: 'Not supported', tags: ['mcp'], responses: { '405': { description: 'Method not allowed (Allow: POST, OPTIONS)' } } },
  };

  paths['/health'] = {
    get: {
      operationId: 'health',
      summary: 'Health check',
      tags: ['meta'],
      responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' } } } } } } },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: SERVER_TITLE,
      version: VERSION,
      description: `${SERVER_DESCRIPTION}\n\nPOST bodies up to ${MAX_BODY_BYTES} bytes.`,
      contact: { email: SUPPORT_EMAIL },
      termsOfService: `${origin}/terms`,
    },
    servers: [{ url: origin }],
    tags: [{ name: 'tools' }, { name: 'mcp' }, { name: 'meta' }],
    paths,
    components: {
      schemas: { Error: errorSchema },
    },
  };
}
