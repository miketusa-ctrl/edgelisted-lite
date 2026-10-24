import { defineConfig } from 'vitest/config';

// Plain Node environment: Workers globals used here (fetch, Request, Response, crypto.subtle,
// Intl, TextEncoder) exist in Node 20+, so the suite runs offline without Miniflare.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
