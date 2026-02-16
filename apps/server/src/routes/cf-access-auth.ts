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
 * 5. Redirect to the app
 */

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
