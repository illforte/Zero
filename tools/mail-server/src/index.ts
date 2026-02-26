import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { env } from './env.js';
import { getAuth } from './auth.js';
import { getDb, schema } from './db/index.js';
import { appRouter } from './trpc/index.js';
import { cfAccessAuthRouter } from './routes/cf-access-auth.js';
import { googleOAuthRouter } from './routes/google-oauth.js';
import { createDriver } from './driver/index.js';
import { eq } from 'drizzle-orm';
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
  return c.json({ status: 'ok', service: 'mail-zero-server-node', version: '1.0.0-20260226-0110' });
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

wss.on('connection', async (ws, req) => {
  const sessions = new Map<string, AbortController>();
  console.log(`[AI agent] New connection request from ${req.socket.remoteAddress}, URL: ${req.url}`);

  // Authenticate user once per connection
  const authHeaders = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => authHeaders.append(key, v));
    } else if (value) {
      authHeaders.set(key, value);
    }
  });

  const session = await auth.api
    .getSession({ headers: authHeaders })
    .catch((err) => {
      console.error('[AI agent] Auth session error:', err);
      return null;
    });

  if (!session?.user) {
    console.warn('[AI agent] Connection unauthorized - no valid session found');
    ws.close(1008, 'Unauthorized');
    return;
  }

  const userId = session.user.id;
  console.log(`[AI agent] Authenticated user: ${session.user.email} (${userId})`);
  const db = getDb();

  // Get user's default connection or first available
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
  });

  let activeConnection = null;
  if (userData?.defaultConnectionId) {
    activeConnection = await db.query.connection.findFirst({
      where: eq(schema.connection.id, userData.defaultConnectionId),
    });
  }

  if (!activeConnection) {
    activeConnection = await db.query.connection.findFirst({
      where: eq(schema.connection.userId, userId),
    });
  }

  if (!activeConnection) {
    console.warn(`[AI agent] No mail connection found for user ${userId}`);
    ws.close(1008, 'No mail connection found');
    return;
  }

  console.log(`[AI agent] Using mail connection: ${activeConnection.email} (${activeConnection.providerId})`);

  const driver = createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken || '',
      refreshToken: activeConnection.refreshToken || '',
      email: activeConnection.email,
    },
  });

  // Tools available for this connection
  const mailTools = {
    searchEmails: tool({
      description: 'Search for email threads based on a query (Gmail search syntax supported).',
      parameters: z.object({
        query: z.string().describe('The search query (e.g., "from:google", "subject:invoice")'),
        maxResults: z.number().optional().default(10),
      }),
      execute: async ({ query, maxResults }) => {
        const results = await driver.list({ folder: 'inbox', query, maxResults });
        return await Promise.all(
          results.threads.map(async (t) => {
            try {
              const thread = await driver.get(t.id);
              return {
                id: t.id,
                subject: thread.latest?.subject,
                from: thread.latest?.sender.email,
                date: thread.latest?.receivedOn,
                unread: thread.hasUnread,
              };
            } catch {
              return { id: t.id, error: 'Failed to fetch details' };
            }
          })
        );
      },
    }),
    deleteThreads: tool({
      description: 'Move email threads to the trash. IMPORTANT: threadIds must be real IDs from searchEmails results (e.g. "18e2a3b4c5d6e7f8"), never placeholder text.',
      parameters: z.object({
        threadIds: z.array(z.string()).describe('Array of exact thread ID strings from searchEmails results (e.g. ["18e2a3b4c5d6e7f8", "18e2a3b4c5d6e7f9"])'),
      }),
      execute: async ({ threadIds }) => {
        try {
          if (!threadIds || threadIds.length === 0) return { success: false, error: 'No thread IDs provided' };
          const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
          if (normalizedIds.length === 0) return { success: false, error: 'Invalid thread IDs provided' };
          await driver.modifyLabels(normalizedIds, { addLabels: ['TRASH'], removeLabels: [] });
          return { success: true, deletedCount: normalizedIds.length };
        } catch (error: any) {
          console.error('[AI agent] deleteThreads error:', error);
          return { success: false, error: error.message || 'Failed to delete threads' };
        }
      },
    }),
    markAsRead: tool({
      description: 'Mark email threads as read.',
      parameters: z.object({
        threadIds: z.array(z.string()).describe('Array of thread IDs to mark as read'),
      }),
      execute: async ({ threadIds }) => {
        try {
          if (!threadIds || threadIds.length === 0) return { success: false, error: 'No thread IDs provided' };
          const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
          if (normalizedIds.length === 0) return { success: false, error: 'Invalid thread IDs provided' };
          await driver.markAsRead(normalizedIds);
          return { success: true };
        } catch (error: any) {
          console.error('[AI agent] markAsRead error:', error);
          return { success: false, error: error.message || 'Failed to mark as read' };
        }
      },
    }),
    markAsUnread: tool({
      description: 'Mark email threads as unread.',
      parameters: z.object({
        threadIds: z.array(z.string()).describe('Array of thread IDs to mark as unread'),
      }),
      execute: async ({ threadIds }) => {
        try {
          if (!threadIds || threadIds.length === 0) return { success: false, error: 'No thread IDs provided' };
          const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
          if (normalizedIds.length === 0) return { success: false, error: 'Invalid thread IDs provided' };
          await driver.markAsUnread(normalizedIds);
          return { success: true };
        } catch (error: any) {
          console.error('[AI agent] markAsUnread error:', error);
          return { success: false, error: error.message || 'Failed to mark as unread' };
        }
      },
    }),
    archiveThreads: tool({
      description: 'Move email threads to the archive by removing the INBOX label.',
      parameters: z.object({
        threadIds: z.array(z.string()).describe('Array of thread IDs to archive'),
      }),
      execute: async ({ threadIds }) => {
        try {
          if (!threadIds || threadIds.length === 0) return { success: false, error: 'No thread IDs provided' };
          const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
          if (normalizedIds.length === 0) return { success: false, error: 'Invalid thread IDs provided' };
          await driver.modifyLabels(normalizedIds, { addLabels: [], removeLabels: ['INBOX'] });
          return { success: true, archivedCount: normalizedIds.length };
        } catch (error: any) {
          console.error('[AI agent] archiveThreads error:', error);
          return { success: false, error: error.message || 'Failed to archive threads' };
        }
      },
    }),
    getEmailContent: tool({
      description: 'Get the full content (messages) of an email thread by ID.',
      parameters: z.object({
        threadId: z.string().describe('The ID of the thread to retrieve'),
      }),
      execute: async ({ threadId }) => {
        const thread = await driver.get(threadId);
        return thread.messages.map((m) => ({
          from: m.sender.email,
          subject: m.subject,
          date: m.receivedOn,
          body: m.decodedBody || m.body,
        }));
      },
    }),
    sendEmail: tool({
      description: 'Send a new email.',
      parameters: z.object({
        to: z.array(z.object({
          email: z.string().describe('Recipient email address'),
          name: z.string().optional().describe('Recipient name'),
        })),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body (HTML or plain text)'),
        threadId: z.string().optional().describe('Thread ID to reply to'),
      }),
      execute: async (data) => {
        await driver.create({
          to: data.to,
          subject: data.subject,
          message: data.body,
          threadId: data.threadId,
          attachments: [],
          headers: {},
        });
        return { success: true };
      },
    }),
    createDraft: tool({
      description: 'Create a draft email.',
      parameters: z.object({
        to: z.string().describe('Recipient email(s) separated by commas'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body'),
        threadId: z.string().optional().nullable().describe('Thread ID'),
      }),
      execute: async (data) => {
        await driver.createDraft({
          to: data.to,
          subject: data.subject,
          message: data.body,
          threadId: data.threadId || null,
          id: null,
          fromEmail: activeConnection.email,
        });
        return { success: true };
      },
    }),
    listLabels: tool({
      description: 'List all available mail labels/folders.',
      parameters: z.object({}),
      execute: async () => {
        const labels = await driver.getUserLabels();
        return labels.map(l => ({ id: l.id, name: l.name, type: l.type }));
      },
    }),
    moveThreads: tool({
      description: 'Move threads to a specific label (folder).',
      parameters: z.object({
        threadIds: z.array(z.string()).describe('Array of thread IDs to move'),
        addLabels: z.array(z.string()).describe('Labels to add (e.g., ["INBOX", "IMPORTANT"])'),
        removeLabels: z.array(z.string()).describe('Labels to remove (e.g., ["SPAM"])'),
      }),
      execute: async ({ threadIds, addLabels, removeLabels }) => {
        const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
        await driver.modifyLabels(normalizedIds, { addLabels, removeLabels });
        return { success: true };
      },
    }),
    unsubscribe: tool({
      description: 'Attempt to unsubscribe from a mailing list for a specific thread.',
      parameters: z.object({
        threadId: z.string().describe('The ID of the thread to unsubscribe from'),
      }),
      execute: async ({ threadId }) => {
        const thread = await driver.get(threadId);
        const lastMsg = thread.messages[thread.messages.length - 1];
        if (!lastMsg?.listUnsubscribe) {
          return { success: false, error: 'No unsubscribe headers found for this thread.' };
        }
        
        // Handle Mailto or HTTP unsubscribe
        const urls = lastMsg.listUnsubscribe.split(',').map(s => s.trim().replace(/[<>]/g, ''));
        const mailto = urls.find(u => u.startsWith('mailto:'));
        const http = urls.find(u => u.startsWith('http'));

        if (http) {
          // In a real scenario, we might want to follow the link, but for now we just report it.
          return { success: true, method: 'link', url: http, message: 'Please visit the link to unsubscribe.' };
        } else if (mailto) {
          const [to, query] = mailto.replace('mailto:', '').split('?');
          const subject = query?.match(/subject=([^&]+)/)?.[1] || 'Unsubscribe';
          await driver.create({
            to: [{ email: decodeURIComponent(to!) }],
            subject: decodeURIComponent(subject),
            message: 'Unsubscribe request sent via Mail-Zero assistant.',
            attachments: [],
            headers: {},
          });
          return { success: true, method: 'email', message: 'Unsubscribe email sent.' };
        }
        return { success: false, error: 'Unsupported unsubscribe method.' };
      },
    }),
  };

  ws.on('message', async (data: import('ws').RawData) => {
    const rawData = data.toString();
    console.log(`[AI agent] Received raw message: ${rawData.slice(0, 100)}${rawData.length > 100 ? '...' : ''}`);
    
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawData);
      console.log(`[AI agent] Parsed message type: ${msg.type}`);
    } catch {
      console.error('[AI agent] Failed to parse WebSocket message');
      return;
    }

    if (msg.type === 'cf_agent_use_chat_request') {
      console.log('[AI agent] Processing chat request...');
      const init = msg.init as { method?: string; body?: string } | undefined;
      if (init?.method !== 'POST' || !init.body) {
        console.warn('[AI agent] Invalid chat request init object');
        return;
      }

      const { messages } = JSON.parse(init.body) as { messages: { role: string; content: string }[] };
      const msgId = msg.id as string;

      ws.send(JSON.stringify({ type: 'cf_agent_chat_messages', messages }));

      const abortController = new AbortController();
      sessions.set(msgId, abortController);

                  try {
                    const modelName = env.LITELLM_MODEL || 'mail-zero-chat';
                    const systemPrompt = 'You are a helpful email assistant. Help the user manage, read, summarize, and respond to their emails.\n' +
                        'CRITICAL RULES:\n' +
                        '1. You have tools to search, read, delete, archive, and label emails.\n' +
                        '2. For ANY destructive action (delete, archive, move), you MUST call searchEmails first to get real thread IDs.\n' +
                        '3. Thread IDs are long alphanumeric strings like "18e2a3b4c5d6e7f8". NEVER use placeholder text as IDs.\n' +
                        '4. When the user confirms (e.g. "yes", "do it", "go ahead"), ALWAYS re-search to get fresh thread IDs, then execute the action in the same turn.\n' +
                        '5. Pass the exact "id" field values from search results to delete/archive/mark tools. Never paraphrase or summarize IDs.\n' +
                        '6. Be concise and professional. Show counts and subjects, not raw IDs.';
                    
                    console.log(`[AI agent] Starting streamText with model: ${modelName} (${messages.length} messages)`);
                    console.log(`[AI agent] System prompt: ${systemPrompt.slice(0, 100)}...`);
                    console.log(`[AI agent] Last message: ${JSON.stringify(messages[messages.length - 1])}`);
                    
                            const litellm = createOpenAI({ apiKey: env.LITELLM_VIRTUAL_KEY, baseURL: env.LITELLM_BASE_URL });
                            console.log(`[AI agent] Tools available: ${Object.keys(mailTools).join(', ')}`);
                            
                            const { textStream } = streamText({
                              model: litellm(modelName),
                              system: systemPrompt,
                              messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
                              tools: mailTools,
                              maxSteps: 10,
                              abortSignal: abortController.signal,
                              onFinish: (result) => {
                                console.log(`[AI agent] streamText finished. Usage: ${JSON.stringify(result.usage)}`);
                              },
                              onError: (error) => {
                                console.error('[AI agent] streamText error:', error);
                              }
                            });
                    
      
              console.log('[AI agent] Stream opened, waiting for chunks...');
              for await (const chunk of textStream) {
                console.log(`[AI agent] Sending chunk (${chunk.length} chars)`);
                ws.send(
                  JSON.stringify({
                    id: msgId,
                    type: 'cf_agent_use_chat_response',
                    body: `0:${JSON.stringify(chunk)}\n`,
                    done: false,
                  }),
                );
              }
              console.log('[AI agent] Stream finished successfully');
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
