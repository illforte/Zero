// Node.js-compatible environment variables (for Docker deployment)
// This file replaces the cloudflare:workers import for Node.js runtime

export const env = process.env as any;
export type Env = typeof env;
