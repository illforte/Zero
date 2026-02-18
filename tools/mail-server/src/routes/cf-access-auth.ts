import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cloudflareAccessMiddleware } from '../middleware/cf-access.js';
import { getNodeZeroDB } from '../db/node-zero-db.js';
import { getAuth } from '../auth.js';
import { getDb, schema } from '../db/index.js';
import { env } from '../env.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { HonoContext } from '../types.js';

/**
 * CF Access Authentication Route
 *
 * Flow:
 * 1. CF Access validates user → adds CF-Access-JWT-Assertion header
 * 2. Our middleware validates the JWT
 * 3. Find/create user in PostgreSQL
 * 4. Create Better Auth session (direct DB insert)
 * 5. Set session cookie
 * 6. Redirect to mail app
 */

function getImapEmailFromUrl(imapUrl: string | undefined): string | null {
  if (!imapUrl) return null;
  const match = imapUrl.match(/^imaps?:\/\/([^:]+):/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export const cfAccessAuthRouter = new Hono<HonoContext>();

cfAccessAuthRouter.get('/cf-access/callback', cloudflareAccessMiddleware, async (c) => {
  const cfUser = c.get('cfAccessUser');

  if (!cfUser?.email) {
    throw new HTTPException(401, { message: 'No user information from Cloudflare Access' });
  }

  const { email, name } = cfUser;
  const db = getDb();
  const auth = getAuth();

  try {
    // 1. Find or create user
    let existingUser = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
    });

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const now = new Date();
      const [newUser] = await db
        .insert(schema.user)
        .values({
          id: uuidv4(),
          email,
          name: name || email.split('@')[0] || 'User',
          emailVerified: true, // CF Access verifies identity
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      userId = newUser!.id;
    }

    // 2. Ensure user has an IMAP connection
    const zeroDB = getNodeZeroDB(db, userId);
    const connections = await zeroDB.findManyConnections();
    const hasImap = connections.some((c) => c.providerId === 'imap');

    if (!hasImap) {
      const imapEmail = getImapEmailFromUrl(env.IMAP_URL) || email;
      await zeroDB.createConnection('imap', imapEmail, {
        name: imapEmail.split('@')[0],
        picture: '',
        accessToken: 'imap-placeholder',
        refreshToken: 'imap-placeholder',
        scope: '',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    }

    // 3. Ensure default settings exist
    const settings = await zeroDB.findUserSettings();
    if (!settings) {
      await zeroDB.insertUserSettings({
        language: 'en',
        timezone: 'UTC',
        externalImages: true,
        customPrompt: '',
        isOnboarded: false,
        colorTheme: 'system',
        zeroSignature: true,
        autoRead: true,
        animations: false,
        imageCompression: 'medium',
      });
    }

    // 4. Create Better Auth session directly in DB
    const sessionToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();

    await db.insert(schema.session).values({
      id: uuidv4(),
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: c.req.header('CF-Connecting-IP') || null,
      userAgent: c.req.header('User-Agent') || null,
    });

    // 5. Set session cookie
    const maxAge = 30 * 24 * 60 * 60;
    const cookieOptions = [
      `better-auth.session_token=${sessionToken}`,
      `Max-Age=${maxAge}`,
      `Path=/`,
      `Domain=${env.COOKIE_DOMAIN}`,
      `HttpOnly`,
      `Secure`,
      `SameSite=None`,
    ].join('; ');

    c.header('Set-Cookie', cookieOptions);

    // 6. Redirect to app
    return c.redirect(env.APP_URL);
  } catch (error) {
    console.error('[cf-access-auth] Error:', error);
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Authentication failed', cause: error });
  }
});

cfAccessAuthRouter.get('/cf-access/health', (c) => {
  return c.json({
    status: 'ok',
    configured: !!(env.CF_ACCESS_AUD && env.CF_ACCESS_TEAM_DOMAIN),
  });
});
