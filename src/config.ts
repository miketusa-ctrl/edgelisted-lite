/**
 * Central configuration. Every number that appears in docs (llms.txt, OpenAPI,
 * landing page) is read from here or from env vars, so nothing drifts.
 */
export const VERSION = '0.1.3';

export const SERVER_NAME = 'edgelisted-lite'; // machine name: change to your server's slug
export const SERVER_TITLE = 'EdgeListed Lite'; // display name: change to your product name
export const SERVER_DESCRIPTION =
  'A read-only slugify tool served as a remote MCP server and a JSON API (EdgeListed Lite example).';
export const SUPPORT_EMAIL = 'digitalpromohub.support@gmail.com'; // replace with your own support address

/** MCP protocol versions this server answers. First = newest. */
export const MODERN_VERSION = '2026-07-28';
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
export const SUPPORTED_VERSIONS: readonly string[] = [MODERN_VERSION, ...LEGACY_VERSIONS];

/** Request-size and abuse guards. */
export const MAX_BODY_BYTES = 32 * 1024; // POST body cap for /mcp and /v1/*
export const MAX_TEXT_CHARS = 20_000; // per string argument

export interface Env {
  ENVIRONMENT?: string;
  MCP_ALLOWED_ORIGINS?: string;
}
