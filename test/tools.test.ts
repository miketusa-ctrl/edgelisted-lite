import { describe, expect, it } from 'vitest';
import { TOOLS, ToolInputError, findTool, validateArgs } from '../src/tools';

const run = (name: string, args: unknown) => {
  const t = findTool(name)!;
  return t.run(validateArgs(t, args));
};

describe('tools', () => {
  it('has unique names that are valid MCP tool names', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
  });

  it('every string input has a maxLength and every object rejects extra args', () => {
    for (const t of TOOLS) {
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const s of Object.values(t.inputSchema.properties ?? {})) {
        if (s.type === 'string') expect(s.maxLength).toBeGreaterThan(0);
        if (s.type === 'array' && s.items?.type === 'string') expect(s.items.maxLength).toBeGreaterThan(0);
      }
    }
  });

  it('slugify removes accents and respects separator and max_length', () => {
    expect(run('slugify', { text: 'Crème Brûlée & Coffee: 10 Tips!' }).slug).toBe('creme-brulee-and-coffee-10-tips');
    expect(run('slugify', { text: 'Hello World', separator: '_' }).slug).toBe('hello_world');
    const long = run('slugify', { text: 'alpha beta gamma delta epsilon zeta', max_length: 20 }).slug as string;
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith('-')).toBe(false);
  });

  it('rejects bad input with ToolInputError', () => {
    const t = findTool('slugify')!;
    expect(() => validateArgs(t, {})).toThrow(ToolInputError); // missing text
    expect(() => validateArgs(t, { text: 'x', extra: 1 })).toThrow(/Unknown argument/);
    expect(() => validateArgs(t, { text: 'a'.repeat(2001) })).toThrow(/too long/);
    expect(() => validateArgs(t, { text: 'x', separator: '/' })).toThrow(/one of/);
  });

  it('Lite ships exactly one tool', () => expect(TOOLS.map((t) => t.name)).toEqual(['slugify']));
});
