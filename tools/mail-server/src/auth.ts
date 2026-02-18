import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb, schema } from './db/index.js';
import { env } from './env.js';

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    _auth = createAuth();
  }
  return _auth;
}

function createAuth() {
  const db = getDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // No email/password — CF Access is the only identity source
    // Better Auth is used only for session cookie management
    advanced: {
      ipAddress: {
        disableIpTracking: true,
      },
      cookiePrefix: 'better-auth',
      crossSubDomainCookies: {
        enabled: true,
        domain: env.COOKIE_DOMAIN,
      },
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      },
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 3,
    },
    trustedOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    onAPIError: {
      onError: (error) => {
        console.error('[better-auth] API Error:', error);
      },
    },
  });
}

export type Auth = ReturnType<typeof getAuth>;
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'];
