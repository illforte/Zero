/**
 * Google OAuth re-auth route for Gmail connections.
 *
 * Usage:
 *   GET /api/gmail/auth   → redirects to Google consent page
 *   GET /api/gmail/callback → exchanges code for tokens, stores refresh_token in DB
 *
 * The redirect URI must be registered in Google Cloud Console:
 *   https://mail.lair404.xyz/api/gmail/callback
 */
import { OAuth2Client } from 'google-auth-library';
import { getDb, schema } from '../db/index.js';
import { getNodeZeroDB } from '../db/node-zero-db.js';
import { getAuth } from '../auth.js';
import type { HonoContext } from '../types.js';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { env } from '../env.js';

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getClient() {
  const redirectUri = `${env.APP_URL}/api/gmail/callback`;
  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export const googleOAuthRouter = new Hono<HonoContext>();

// Step 1: Initiate Google OAuth consent
googleOAuthRouter.get('/api/gmail/auth', async (c) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: 'Google OAuth not configured (missing GOOGLE_CLIENT_ID/SECRET)' }, 500);
  }

  // Validate session — need userId to associate connection later
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!session?.user?.id) {
    return c.redirect(`${env.APP_URL}/`);
  }

  // Encode userId in state so callback can create the connection under the right user
  const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString('base64url');
  const url = getClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token even if already granted
    scope: SCOPES,
    state,
  });
  return c.redirect(url);
});

// Step 2: OAuth callback — exchange code for tokens, store in DB
googleOAuthRouter.get('/api/gmail/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error) {
    return c.html(`<html><body><h2>❌ OAuth error: ${error}</h2></body></html>`, 400);
  }
  if (!code) {
    return c.html(`<html><body><h2>❌ No code returned from Google</h2></body></html>`, 400);
  }

  try {
    const client = getClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return c.html(
        `<html><body>
          <h2>❌ No refresh token returned</h2>
          <p>Google only issues refresh tokens on the first consent or when forced.</p>
          <p>To fix: go to <a href="https://myaccount.google.com/permissions">Google Account Permissions</a>,
          revoke access for this app, then <a href="/api/gmail/auth">try again</a>.</p>
        </body></html>`,
        400,
      );
    }

    // Get email from id_token
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const email = ticket.getPayload()?.email;
    if (!email) {
      return c.html(`<html><body><h2>❌ Could not determine email from Google token</h2></body></html>`, 400);
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // Parse userId from state (set in /api/gmail/auth)
    let userId: string | null = null;
    const stateParam = c.req.query('state');
    if (stateParam) {
      try {
        const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
        userId = parsed.userId ?? null;
      } catch {}
    }

    // Fall back to session cookie if state is missing/malformed
    if (!userId) {
      const auth = getAuth();
      const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
      userId = session?.user?.id ?? null;
    }

    if (!userId) {
      return c.html(`<html><body><h2>❌ No authenticated session — please log in and try again</h2></body></html>`, 401);
    }

    const db = getDb();
    const existing = await db.query.connection.findFirst({
      where: and(
        eq(schema.connection.email, email),
        eq(schema.connection.providerId, 'google'),
        eq(schema.connection.userId, userId),
      ),
    });

    if (existing) {
      await db
        .update(schema.connection)
        .set({
          accessToken: tokens.access_token || existing.accessToken,
          refreshToken: tokens.refresh_token,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.connection.id, existing.id));
    } else {
      // Create new connection for this user
      const payload = ticket.getPayload();
      const zeroDB = getNodeZeroDB(db, userId);
      await zeroDB.createConnection('google', email, {
        name: payload?.name || email.split('@')[0],
        picture: payload?.picture || '',
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token,
        scope: SCOPES.join(' '),
        expiresAt,
      });
    }

    return c.html(`
      <html><body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto">
        <h2>✅ Gmail reconnected successfully</h2>
        <p><strong>Account:</strong> ${email}</p>
        <p><strong>Refresh token:</strong> ✓ stored</p>
        <p><strong>Expires:</strong> ${expiresAt.toISOString()}</p>
        <p><a href="${env.APP_URL}/mail/inbox" style="background:#2563eb;color:#fff;padding:.5rem 1rem;border-radius:.375rem;text-decoration:none">Go to inbox</a></p>
      </body></html>
    `);
  } catch (err) {
    console.error('[google-oauth] callback error:', err);
    return c.html(
      `<html><body><h2>❌ Error: ${err instanceof Error ? err.message : String(err)}</h2></body></html>`,
      500,
    );
  }
});
