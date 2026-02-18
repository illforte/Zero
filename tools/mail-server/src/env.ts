// Typed environment variables for Node.js runtime

export const env = {
  PORT: process.env.PORT || '3051',
  NODE_ENV: (process.env.NODE_ENV || 'production') as 'development' | 'production',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Better Auth
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || '',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'https://mail-api.lair404.xyz',

  // Cloudflare Access
  CF_ACCESS_AUD: process.env.CF_ACCESS_AUD || '',
  CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN || 'lair404.xyz',

  // Mail
  IMAP_PROXY_URL: process.env.IMAP_PROXY_URL || 'http://127.0.0.1:3060',
  IMAP_URL: process.env.IMAP_URL || '',
  SMTP_URL: process.env.SMTP_URL || '',

  // App URLs
  APP_URL: process.env.APP_URL || 'https://mail.lair404.xyz',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'https://mail.lair404.xyz',

  // Cookie
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '.lair404.xyz',
} as const;

export type Env = typeof env;
