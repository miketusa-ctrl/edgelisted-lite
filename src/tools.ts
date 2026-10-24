/**
 * The single source of truth for tools. MCP tools/list, MCP tools/call,
 * the REST routes (POST /v1/tools/<name>) and /openapi.json are all
 * generated from TOOLS. Add a tool here and every surface picks it up.
 */
import { MAX_TEXT_CHARS } from './config';

export type JsonSchema = {
  type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: readonly string[];
  default?: unknown;
  examples?: unknown[];
};

export class ToolInputError extends Error {}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object' };
  outputSchema: JsonSchema & { type: 'object' };
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run(args: Record<string, unknown>): Record<string, unknown>;
  summarize(out: Record<string, unknown>): string;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/* ---------------- slugify ---------------- */

function slugify(args: Record<string, unknown>) {
  const sep = (args.separator as string | undefined) ?? '-';
  const max = (args.max_length as number | undefined) ?? 80;
  let s = String(args.text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`\\${sep}{2,}`, 'g'), sep)
    .replace(new RegExp(`^\\${sep}|\\${sep}$`, 'g'), '');
  if (s.length > max) {
    s = s.slice(0, max);
    const cut = s.lastIndexOf(sep);
    if (cut > max / 2) s = s.slice(0, cut);
    s = s.replace(new RegExp(`\\${sep}$`), '');
  }
  return { slug: s, length: s.length };
}

/* ---------------- registry ---------------- */

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'slugify',
    title: 'Slugify',
    description:
      'Turn a title or phrase into a URL-safe ASCII slug (accents removed, lowercase, custom separator, optional max length that cuts on a word boundary). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Title or phrase to convert.', minLength: 1, maxLength: 2000, examples: ['Crème Brûlée & Coffee: 10 Tips!'] },
        separator: { type: 'string', description: 'Separator character.', maxLength: 1, enum: ['-', '_', '.'], default: '-' },
        max_length: { type: 'integer', description: 'Maximum slug length.', minimum: 8, maximum: 200, default: 80 },
      },
      required: ['text'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, length: { type: 'integer' } },
      required: ['slug', 'length'],
    },
    annotations: READ_ONLY,
    run: slugify,
    summarize: (o) => String(o.slug),
  },
];

/** Array-length limits that JSON Schema 'maxItems' would express; kept out of the schema type for brevity. */
const MAX_ITEMS: Record<string, number> = {};

export const findTool = (name: unknown): ToolDef | undefined => TOOLS.find((t) => t.name === name);

/**
 * Validate arguments against the tool's input schema (the subset this kit uses).
 * Returns a copy with defaults applied. Throws ToolInputError with a short message.
 */
export function validateArgs(tool: ToolDef, raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ToolInputError('arguments must be a JSON object');
  const args = raw as Record<string, unknown>;
  const props = tool.inputSchema.properties ?? {};
  const unknown = Object.keys(args).filter((k) => !Object.hasOwn(props, k));
  if (unknown.length) throw new ToolInputError(`Unknown argument(s): ${unknown.slice(0, 5).join(', ').slice(0, 80)}`);
  for (const r of tool.inputSchema.required ?? []) {
    if (args[r] === undefined) throw new ToolInputError(`Missing required argument: ${r}`);
  }
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(props)) {
    const v = args[k];
    if (v === undefined) {
      if (s.default !== undefined) out[k] = s.default;
      continue;
    }
    out[k] = checkValue(k, v, s);
  }
  return out;
}

function checkValue(k: string, v: unknown, s: JsonSchema): unknown {
  switch (s.type) {
    case 'string': {
      if (typeof v !== 'string') throw new ToolInputError(`${k} must be a string`);
      if (s.maxLength !== undefined && v.length > s.maxLength) throw new ToolInputError(`${k} is too long (max ${s.maxLength} characters)`);
      if (s.minLength !== undefined && v.length < s.minLength) throw new ToolInputError(`${k} is too short (min ${s.minLength})`);
      if (s.enum && !s.enum.includes(v)) throw new ToolInputError(`${k} must be one of: ${s.enum.join(' ')}`);
      return v;
    }
    case 'integer':
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v) || (s.type === 'integer' && !Number.isInteger(v)))
        throw new ToolInputError(`${k} must be ${s.type === 'integer' ? 'an integer' : 'a number'}`);
      if (s.minimum !== undefined && v < s.minimum) throw new ToolInputError(`${k} must be >= ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) throw new ToolInputError(`${k} must be <= ${s.maximum}`);
      return v;
    }
    case 'boolean':
      if (typeof v !== 'boolean') throw new ToolInputError(`${k} must be true or false`);
      return v;
    case 'array': {
      if (!Array.isArray(v)) throw new ToolInputError(`${k} must be an array`);
      const max = MAX_ITEMS[k] ?? 50;
      if (v.length === 0 || v.length > max) throw new ToolInputError(`${k} must have 1 to ${max} items`);
      return v.map((x, i) => checkValue(`${k}[${i}]`, x, s.items ?? { type: 'string' }));
    }
    default:
      throw new ToolInputError(`${k} has an unsupported type`);
  }
}

/** JSON Schema for publishing (adds maxItems where the validator enforces it). */
export function publishedInputSchema(tool: ToolDef): JsonSchema & { maxItems?: number } {
  const props: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(tool.inputSchema.properties ?? {})) {
    props[k] = s.type === 'array' ? { ...s, minItems: 1, maxItems: MAX_ITEMS[k] ?? 50 } : s;
  }
  return { ...tool.inputSchema, properties: props as Record<string, JsonSchema> };
}
