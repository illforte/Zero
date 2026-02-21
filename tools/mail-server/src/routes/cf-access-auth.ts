import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { cloudflareAccessMiddleware } from '../middleware/cf-access.js';
import { getNodeZeroDB } from '../db/node-zero-db.js';
import { getAuth } from '../auth.js';
import { getDb, schema } from '../db/index.js';
import { env } from '../env.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';
import type { HonoContext } from '../types.js';

/**
 * Sign a cookie value to match better-call's serializeSignedCookie format
 * (used internally by Better Auth via better-call).
 *
 * Format: encodeURIComponent(`${value}.${standardBase64_hmac_sha256(value, secret)}`)
 *
 * Critical: better-call's getSignedCookie guard:
 *   if (signature.length !== 44 || !signature.endsWith("=")) return null;
 * → Must use STANDARD base64 with padding (not base64url), exactly 44 chars ending in "="
 * → Must URL-encode the result (parseCookies calls decodeURIComponent on read)
 */
function signCookieValue(value: string, secret: string): string {
  const sig = createHmac('sha256', secret)
    .update(value)
    .digest('base64'); // standard base64 WITH padding — keep +, /, and = chars
  return encodeURIComponent(`${value}.${sig}`);
}

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

    // 2. Find the best connection for redirect:
    //    - Prefer Google connection matching the CF Access email (Gmail access)
    //    - Fall back to any IMAP connection
    //    - Last resort: create an IMAP placeholder connection
    const zeroDB = getNodeZeroDB(db, userId);
    const connections = await zeroDB.findManyConnections();
    const googleConnection = connections.find((c) => c.providerId === 'google' && c.email === email);
    const existingImap = connections.find((c) => c.providerId === 'imap');
    let connectionId: string;

    if (googleConnection) {
      connectionId = googleConnection.id;
    } else if (existingImap) {
      connectionId = existingImap.id;
    } else {
      const imapEmail = getImapEmailFromUrl(env.IMAP_URL) || email;
      // Store real IMAP/SMTP URLs in accessToken/refreshToken so per-connection credentials work.
      // For users whose email matches the global IMAP_URL account, use those credentials directly.
      // Others get a placeholder; admin can update via trpc connections.updateImapCredentials.
      const globalImapEmail = getImapEmailFromUrl(env.IMAP_URL);
      const imapCred =
        globalImapEmail && globalImapEmail === imapEmail ? (env.IMAP_URL || 'imap-placeholder') : 'imap-placeholder';
      const smtpCred =
        globalImapEmail && globalImapEmail === imapEmail ? (env.SMTP_URL || 'imap-placeholder') : 'imap-placeholder';
      await zeroDB.createConnection('imap', imapEmail, {
        name: imapEmail.split('@')[0],
        picture: '',
        accessToken: imapCred,
        refreshToken: smtpCred,
        scope: '',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
      // Fetch the newly created connection to get its ID
      const fresh = await zeroDB.findManyConnections();
      connectionId = fresh.find((c) => c.providerId === 'imap')!.id;
    }

    // 3. Ensure default settings exist and isOnboarded is always true
    const settings = await zeroDB.findUserSettings();
    if (!settings) {
      await zeroDB.insertUserSettings({
        language: 'en',
        timezone: 'UTC',
        externalImages: true,
        customPrompt: '',
        isOnboarded: true,
        colorTheme: 'system',
        zeroSignature: true,
        autoRead: true,
        animations: false,
        imageCompression: 'medium',
      });
    } else {
      const s = settings.settings as Record<string, unknown> | null;
      if (!s?.isOnboarded) {
        await zeroDB.updateUserSettings({ ...(s ?? {}), isOnboarded: true });
      }
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

    // 5. Set session cookie — Better Auth uses better-call's serializeSignedCookie format:
    //    encodeURIComponent(value + "." + standardBase64_hmac_sha256(value, secret))
    //    Signature must be exactly 44 standard base64 chars ending in "="
    const maxAge = 30 * 24 * 60 * 60;
    const signedValue = signCookieValue(sessionToken, env.BETTER_AUTH_SECRET);
    const cookieName = '__Secure-better-auth.session_token';
    const cookieOptions = [
      `${cookieName}=${signedValue}`,
      `Max-Age=${maxAge}`,
      `Path=/`,
      `Domain=${env.COOKIE_DOMAIN}`,
      `HttpOnly`,
      `Secure`,
      `SameSite=Lax`,
    ].join('; ');

    c.header('Set-Cookie', cookieOptions);

    // 6. Redirect to inbox (Zero email route: /mail/inbox)
    return c.redirect(`${env.APP_URL}/mail/inbox`);
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
