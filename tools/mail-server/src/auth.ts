import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb, schema } from './db/index.js';
import { env } from './env.js';
import { createDriver } from './driver/index.js';
import { getNodeZeroDB } from './db/node-zero-db.js';

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    _auth = createAuth();
  }
  return _auth;
}

/**
 * Build the social providers config dynamically.
 * Google is enabled when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 * This keeps the server generic — works on lair404, n1njanode, or any
 * self-hosted deployment without code changes.
 */
function buildSocialProviders(): Record<string, unknown> {
  const providers: Record<string, unknown> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // Explicitly set the redirect URI to the Tailscale URL.
      // This guarantees the callback matches Google Cloud Console perfectly,
      // bypassing any Nginx/Hono proxy header parsing issues.
      redirectURI: 'https://lair404.tail099aa2.ts.net:3050/api/auth/callback/google',
      // Request offline access + Gmail scopes so the OAuth token can
      // also be used to connect the mailbox after login.
      accessType: 'offline',
      scope: [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    };
    console.log('   Google SSO:       ✓ enabled');
  } else {
    console.log('   Google SSO:       ✗ disabled (no GOOGLE_CLIENT_ID/SECRET)');
  }

  return providers;
}

/** Collect trusted origins from both CORS_ORIGINS and BETTER_AUTH_TRUSTED_ORIGINS */
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>();
  env.CORS_ORIGINS.split(',').forEach((o) => origins.add(o.trim()));
  if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
    env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').forEach((o) => origins.add(o.trim()));
  }
  return [...origins].filter(Boolean);
}

function createAuth() {
  const db = getDb();
  const socialProviders = buildSocialProviders();
  const hasSocialProviders = Object.keys(socialProviders).length > 0;

  // Only enable cross-subdomain cookies when a COOKIE_DOMAIN is explicitly set.
  // When accessed via Tailscale (.ts.net), omitting COOKIE_DOMAIN lets the
  // browser scope cookies to the exact hostname automatically.
  // Always disable crossSubDomainCookies so the browser scopes the cookie to the exact incoming host.
  // This allows the same container to serve both Tailscale (.ts.net) and public (.lair404.xyz)
  // requests without Cookie Domain mismatch rejecting the authentication.
  const crossSubDomainCookies = { enabled: false };

  return betterAuth({
    databaseHooks: {
      account: {
        create: {
          after: async (account) => {
            try {
              if (!account.accessToken || !account.refreshToken) {
                console.error('Missing Access/Refresh Tokens for connection:', account.providerId);
                return;
              }

              const driver = createDriver(account.providerId, {
                auth: {
                  accessToken: account.accessToken,
                  refreshToken: account.refreshToken,
                  userId: account.userId,
                  email: '',
                },
              });

              let userInfo;
              try {
                userInfo = await driver.getUserInfo();
              } catch (err) {
                console.error('[OAuth] Failed to get user info from provider. Is Google People API enabled?', err);
                return;
              }

              if (!userInfo?.address) {
                console.error('[OAuth] No email address returned from provider.');
                return;
              }

              const updatingInfo = {
                name: userInfo.name || 'Unknown',
                picture: userInfo.photo || '',
                accessToken: account.accessToken,
                refreshToken: account.refreshToken,
                scope: driver.getScope(),
                expiresAt: new Date(Date.now() + (account.accessTokenExpiresAt?.getTime() || 3600000)),
              };

              const zeroDB = getNodeZeroDB(db, account.userId);
              await zeroDB.createConnection(
                account.providerId as 'google' | 'imap',
                userInfo.address,
                updatingInfo,
              );
              console.log('[OAuth] Created Mail0 connection successfully for:', userInfo.address);
            } catch (error) {
              console.error('[OAuth] Error in account creation hook:', error);
            }
          },
        },
      },
    },
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
    // baseURL is dynamically inferred from the request's origin/Host header.
    // This allows multi-origin support (e.g. mail.lair404.xyz and Tailscale).
    // Social providers are conditionally enabled based on env vars.
    // CF Access remains the primary auth source when accessed via Cloudflare.
    ...(hasSocialProviders ? { socialProviders } : {}),
    advanced: {
      trustHost: true,
      ipAddress: {
        disableIpTracking: true,
      },
      cookiePrefix: 'better-auth',
      crossSubDomainCookies,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      },
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 3,
    },
    trustedOrigins: buildTrustedOrigins(),
    onAPIError: {
      onError: (error) => {
        console.error('[better-auth] API Error:', error);
      },
    },
  });
}

export type Auth = ReturnType<typeof getAuth>;
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'];
