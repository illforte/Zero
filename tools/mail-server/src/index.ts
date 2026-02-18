import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env.js';
import { getAuth } from './auth.js';
import { getDb } from './db/index.js';
import { appRouter } from './trpc/index.js';
import { cfAccessAuthRouter } from './routes/cf-access-auth.js';
import type { HonoContext } from './types.js';
import type { TrpcContext } from './trpc/context.js';
import type { Context } from 'hono';

const app = new Hono<HonoContext>();

app.use('*', logger());

app.use(
  '*',
  cors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'CF-Access-JWT-Assertion', 'cookie'],
    exposeHeaders: ['X-Zero-Redirect'],
  }),
);

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'mail-zero-server-node', version: '1.0.0' });
});

// CF Access auth routes
app.route('/', cfAccessAuthRouter);

// Better Auth session endpoints
const auth = getAuth();
app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw);
});

// Session injection middleware for tRPC
app.use('/trpc/*', async (c, next) => {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null);
  if (session?.user) {
    c.set('sessionUser', session.user);
  }
  await next();
});

// tRPC
const db = getDb();

app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    createContext: (_opts, c: Context<HonoContext>): TrpcContext => {
      return {
        c,
        sessionUser: c.get('sessionUser'),
        auth,
        db,
      };
    },
  }),
);

const port = parseInt(env.PORT);
console.log(`🚀 mail-zero-server-node starting on port ${port}`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✅ Listening on http://127.0.0.1:${info.port}`);
  console.log(`   CF_ACCESS_AUD: ${env.CF_ACCESS_AUD ? '✓' : '✗ missing'}`);
  console.log(`   DATABASE_URL:  ${env.DATABASE_URL ? '✓' : '✗ missing'}`);
  console.log(`   IMAP_URL:      ${env.IMAP_URL ? '✓' : '✗ missing'}`);
});
