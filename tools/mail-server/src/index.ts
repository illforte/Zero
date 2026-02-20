import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { env } from './env.js';
import { getAuth } from './auth.js';
import { getDb } from './db/index.js';
import { appRouter } from './trpc/index.js';
import { cfAccessAuthRouter } from './routes/cf-access-auth.js';
import { googleOAuthRouter } from './routes/google-oauth.js';
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

// The AI agent WebSocket is attached directly to the HTTP server below (see wss setup).

// CF Access auth routes
app.route('/', cfAccessAuthRouter);

// Google OAuth re-auth (must be before better-auth /api/auth/** catch-all)
app.route('/', googleOAuthRouter);

// Better Auth session endpoints
const auth = getAuth();
app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw);
});

// Session injection middleware for tRPC (handles both /trpc/* and /api/trpc/* paths)
const trpcSessionMiddleware = async (c: Context<HonoContext>, next: () => Promise<void>) => {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch(() => null);
  if (session?.user) {
    c.set('sessionUser', session.user);
  }
  await next();
};

app.use('/trpc/*', trpcSessionMiddleware);
app.use('/api/trpc/*', trpcSessionMiddleware);

// tRPC
const db = getDb();

const trpcConfig = {
  router: appRouter,
  allowMethodOverride: true, // allow POST for query procedures (tRPC v11 httpBatchLink sends POST)
  createContext: (_opts: unknown, c: Context<HonoContext>): TrpcContext => {
    return {
      c,
      sessionUser: c.get('sessionUser'),
      auth,
      db,
    };
  },
};

app.use('/trpc/*', trpcServer(trpcConfig));
app.use('/api/trpc/*', trpcServer(trpcConfig));

const port = parseInt(env.PORT);
console.log(`🚀 mail-zero-server-node starting on port ${port}`);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`✅ Listening on http://127.0.0.1:${info.port}`);
  console.log(`   CF_ACCESS_AUD:    ${env.CF_ACCESS_AUD ? '✓' : '✗ missing'}`);
  console.log(`   DATABASE_URL:     ${env.DATABASE_URL ? '✓' : '✗ missing'}`);
  console.log(`   IMAP_URL:         ${env.IMAP_URL ? '✓' : '✗ missing'}`);
  console.log(`   LITELLM_BASE_URL: ${env.LITELLM_BASE_URL}`);
});

// AI agent WebSocket — implements the cf_agent protocol to connect frontend to LiteLLM proxy.
// Uses ws package attached to the same HTTP server; handles /agents/:agent/:id paths.
const wss = new WebSocketServer({ noServer: true });

(server as import('node:http').Server).on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/agents/')) {
    wss.handleUpgrade(req, socket as import('node:net').Socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const sessions = new Map<string, AbortController>();

  ws.on('message', async (data: import('ws').RawData) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'cf_agent_use_chat_request') {
      const init = msg.init as { method?: string; body?: string } | undefined;
      if (init?.method !== 'POST' || !init.body) return;

      const { messages } = JSON.parse(init.body) as { messages: { role: string; content: string }[] };
      const msgId = msg.id as string;

      ws.send(JSON.stringify({ type: 'cf_agent_chat_messages', messages }));

      const abortController = new AbortController();
      sessions.set(msgId, abortController);

      try {
        const litellm = createOpenAI({ apiKey: env.LITELLM_VIRTUAL_KEY, baseURL: env.LITELLM_BASE_URL });
        const { textStream } = streamText({
          model: litellm(env.LITELLM_MODEL),
          system:
            'You are a helpful email assistant. Help the user manage, read, summarize, and respond to their emails. Be concise and professional.',
          messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          abortSignal: abortController.signal,
        });

        for await (const chunk of textStream) {
          ws.send(
            JSON.stringify({ id: msgId, type: 'cf_agent_use_chat_response', body: `0:${JSON.stringify(chunk)}\n`, done: false }),
          );
        }
      } catch (e: unknown) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          console.error('[AI agent] error:', e);
        }
      } finally {
        sessions.delete(msgId);
        ws.send(JSON.stringify({ id: msgId, type: 'cf_agent_use_chat_response', body: '', done: true }));
      }
    } else if (msg.type === 'cf_agent_chat_clear') {
      ws.send(JSON.stringify({ type: 'cf_agent_chat_messages', messages: [] }));
    } else if (msg.type === 'cf_agent_chat_request_cancel') {
      const id = msg.id as string;
      sessions.get(id)?.abort();
      sessions.delete(id);
    }
  });

  ws.on('close', () => {
    for (const c of sessions.values()) c.abort();
    sessions.clear();
  });
});
