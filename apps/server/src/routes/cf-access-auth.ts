import { Hono } from 'hono';
import type { HonoContext } from '../ctx';
import { cloudflareAccessMiddleware, getCfAccessUser } from '../middleware/cloudflare-access';
import { getZeroDB } from '../lib/server-utils';
import { HTTPException } from 'hono/http-exception';
import { defaultUserSettings } from '../lib/schemas';
import { getBrowserTimezone, isValidTimezone } from '../lib/timezones';
import { createDb } from '../db';
import { user as userTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { EProviders } from '../types';

/**
 * Cloudflare Access Authentication Route
 *
 * This route handles authentication via Cloudflare Access.
 * Users are redirected here after successfully authenticating through Cloudflare Access.
 *
 * Flow:
 * 1. Cloudflare Access validates user and adds CF-Access-JWT-Assertion header
 * 2. Our middleware validates the JWT
 * 3. We create/find the user in our database
 * 4. We create a session using better-auth
 * 5. Create an IMAP connection for the user
 * 6. Redirect to the app
 */

// Helper to extract email from IMAP URL
function getImapEmailFromUrl(imapUrl: string | undefined): string | null {
  if (!imapUrl) return null;
  // Format: imap://user@domain.com:pass@host:port or imaps://user@domain.com:pass@host:port
  const match = imapUrl.match(/^imaps?:\/\/([^:]+):/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const cfAccessAuthRouter = new Hono<HonoContext>();

cfAccessAuthRouter.get('/cf-access/callback', cloudflareAccessMiddleware, async (c) => {
  try {
    const cfUser = getCfAccessUser(c);

    if (!cfUser || !cfUser.email) {
      throw new HTTPException(401, {
        message: 'No user information from Cloudflare Access'
      });
    }

    const { email, name } = cfUser;

    // Get or create user in database
    const auth = c.var.auth;
    const db = createDb(c.env.HYPERDRIVE.connectionString);

    // Check if user exists by email
    const existingUser = await db.db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1)
      .then(([user]) => user);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;

      // For existing users, ensure they have an IMAP connection
      const userDb = await getZeroDB(userId);
      const connections = await userDb.findManyConnections();
      const hasImapConnection = connections.some(conn => conn.providerId === EProviders.imap);

      if (!hasImapConnection) {
        const imapEmail = getImapEmailFromUrl(c.env.IMAP_URL) || 'mail@lair404.xyz';
        await userDb.createConnection(
          EProviders.imap,
          imapEmail,
          {
            name: imapEmail.split('@')[0],
            picture: '',
            accessToken: 'imap-placeholder-token',
            refreshToken: 'imap-placeholder-refresh',
            scope: '',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          }
        );
      }
    } else {
      // Create new user
      const newUser = await db.db
        .insert(userTable)
        .values({
          email,
          name: name || email.split('@')[0],
          emailVerified: true, // CF Access verifies email
        })
        .returning()
        .then(([user]) => user);

      userId = newUser.id;

      // Create default settings for new user
      const userDb = await getZeroDB(userId);
      const headerTimezone = c.req.header('x-vercel-ip-timezone');
      const timezone =
        headerTimezone && isValidTimezone(headerTimezone)
          ? headerTimezone
          : getBrowserTimezone();

      await userDb.insertUserSettings({
        ...defaultUserSettings,
        timezone,
      });

      // Create IMAP connection for new user
      // IMAP driver reads credentials from environment variables,
      // so we use placeholder tokens (not actual OAuth tokens)
      // Extract mailbox email from IMAP_URL (e.g., mail@lair404.xyz)
      const imapEmail = getImapEmailFromUrl(c.env.IMAP_URL) || 'mail@lair404.xyz';
      await userDb.createConnection(
        EProviders.imap,
        imapEmail,
        {
          name: imapEmail.split('@')[0],
          picture: '',
          accessToken: 'imap-placeholder-token',
          refreshToken: 'imap-placeholder-refresh',
          scope: '',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        }
      );
    }

    // Create session using better-auth
    const session = await auth.api.signInEmail({
      body: {
        email,
        callbackURL: c.env.VITE_PUBLIC_APP_URL,
      },
      headers: c.req.raw.headers,
      query: {},
    });

    // Redirect to the app
    return c.redirect(c.env.VITE_PUBLIC_APP_URL);
  } catch (error) {
    console.error('CF Access auth error:', error);

    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message: 'Authentication failed',
      cause: error,
    });
  }
});

// Health check endpoint (no auth required)
cfAccessAuthRouter.get('/cf-access/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'CF Access auth route is healthy',
    configured: !!(c.env.CF_ACCESS_AUD && c.env.CF_ACCESS_TEAM_DOMAIN),
  });
});
