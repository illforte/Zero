import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { getDb, schema } from './db/index.js';
import { createDriver } from './driver/index.js';
import { eq } from 'drizzle-orm';
import { env } from './env.js';
import type { MailManager } from './driver/types.js';

const server = new McpServer({
  name: 'mail-zero-mcp',
  version: '1.4.0',
});

// Audit logger
function logToolUsage(toolName: string, params: any) {
  const timestamp = new Date().toISOString();
  const user = process.env.MAIL_ZERO_USER_EMAIL || 'unknown';
  console.error(`[AUDIT] ${timestamp} - User: ${user} - Tool: ${toolName} - Params: ${JSON.stringify(params)}`);
}

// Cache drivers per email
const drivers = new Map<string, MailManager>();

async function getMailDriver(email?: string): Promise<MailManager> {
  if (!email) {
    email = process.env.MAIL_ZERO_USER_EMAIL;
  }
  if (!email) {
    throw new Error('No user email provided. Use MAIL_ZERO_USER_EMAIL env or pass it.');
  }

  const cached = drivers.get(email);
  if (cached) return cached;

  const db = getDb();
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.email, email),
  });

  if (!userData) {
    throw new Error(`User ${email} not found in database.`);
  }

  const userId = userData.id;

  let activeConnection = null;
  if (userData.defaultConnectionId) {
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
    throw new Error(`No mail connection found for user ${email}.`);
  }

  const driver = createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken || '',
      refreshToken: activeConnection.refreshToken || '',
      email: activeConnection.email,
    },
  });

  drivers.set(email, driver);
  return driver;
}

// Register Tools
server.tool(
  'search_emails',
  'Search for email threads based on a query (Gmail search syntax supported). Returns summarized preview.',
  {
    query: z.string().describe('The search query (e.g., "from:google", "is:unread")'),
    maxResults: z.number().optional().default(10),
  },
  async ({ query, maxResults }) => {
    logToolUsage('search_emails', { query, maxResults });
    try {
      const driver = await getMailDriver();
      const results = await driver.list({ folder: 'inbox', query, maxResults });
      const threads = await Promise.all(
        results.threads.map(async (t: any) => {
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
      return { content: [{ type: 'text', text: JSON.stringify(threads, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'get_email_content',
  'Get the full content (messages) of an email thread by ID.',
  {
    threadId: z.string().describe('The ID of the thread to retrieve'),
  },
  async ({ threadId }) => {
    logToolUsage('get_email_content', { threadId });
    try {
      const driver = await getMailDriver();
      const thread = await driver.get(threadId);
      const messages = thread.messages.map((m: any) => ({
        id: m.id,
        from: m.sender.email,
        subject: m.subject,
        date: m.receivedOn,
        body: m.decodedBody || m.body,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'summarize_thread',
  'Generate a concise AI summary of an entire email thread.',
  {
    threadId: z.string().describe('The ID of the thread to summarize'),
  },
  async ({ threadId }) => {
    logToolUsage('get_email_content', { threadId });
    try {
      const driver = await getMailDriver();
      const thread = await driver.get(threadId);
      const content = thread.messages.map((m: any) => `${m.sender.email}: ${m.decodedBody || m.body}`).join('\n---\n');
      
      const litellm = createOpenAI({ apiKey: env.LITELLM_VIRTUAL_KEY, baseURL: env.LITELLM_BASE_URL });
      const { text } = await generateText({
        model: litellm(env.LITELLM_MODEL || 'llama'),
        system: 'You are a helpful assistant that provides extremely concise summaries of email threads. Focus on action items and key information.',
        prompt: `Please summarize this email thread:\n\n${content}`,
      });

      return { content: [{ type: 'text', text }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'get_mailbox_stats',
  'Get unread counts and total email counts across standard folders (Inbox, Sent, Drafts).',
  {},
  async () => {
    logToolUsage('get_mailbox_stats', {});
    try {
      const driver = await getMailDriver();
      const counts = await driver.count();
      return { content: [{ type: 'text', text: JSON.stringify(counts, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'reply_to_thread',
  'Reply to an existing email thread. Automatically references the original message.',
  {
    threadId: z.string().describe('The ID of the thread to reply to'),
    body: z.string().describe('The HTML or plain text body of the reply'),
  },
  async ({ threadId, body }) => {
    try {
      const driver = await getMailDriver();
      const thread = await driver.get(threadId);
      const lastMsg = thread.latest || thread.messages[thread.messages.length - 1];
      if (!lastMsg) {
        return { content: [{ type: 'text', text: 'Thread has no messages to reply to.' }], isError: true };
      }

      await driver.create({
        to: [lastMsg.sender],
        subject: lastMsg.subject.startsWith('Re:') ? lastMsg.subject : `Re: ${lastMsg.subject}`,
        message: body,
        threadId: threadId,
        attachments: [],
        headers: {
          'In-Reply-To': lastMsg.messageId || '',
          'References': lastMsg.messageId || '',
        },
      });
      return { content: [{ type: 'text', text: 'Reply sent successfully.' }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'mark_as_spam',
  'Move specific threads to the Spam folder (removes INBOX, adds SPAM label).',
  {
    threadIds: z.array(z.string()).describe('Array of thread IDs to mark as spam'),
  },
  async ({ threadIds }) => {
    try {
      const driver = await getMailDriver();
      const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
      await driver.modifyLabels(normalizedIds, { addLabels: ['SPAM'], removeLabels: ['INBOX'] });
      return { content: [{ type: 'text', text: `Successfully marked ${normalizedIds.length} threads as spam.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'delete_threads',
  'Move email threads to the trash. IDs must be exact alphanumeric strings from search results. Subjects or other text are NOT valid IDs. If some IDs are invalid or already deleted, they will be skipped.',
  {
    threadIds: z.array(z.string()).describe('Array of exact hexadecimal thread ID strings from search results.'),
  },
  async ({ threadIds }) => {
    try {
      const driver = await getMailDriver();
      const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
      if (normalizedIds.length === 0) {
        return { 
          content: [{ type: 'text', text: 'Error: No valid thread IDs provided. Please ensure you use the alphanumeric "id" field from search results.' }],
          isError: true 
        };
      }
      await driver.modifyLabels(normalizedIds, { addLabels: ['TRASH'], removeLabels: [] });
      return { 
        content: [{ type: 'text', text: `Successfully processed ${normalizedIds.length} threads (moved to trash).` }] 
      };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'archive_threads',
  'Move email threads to the archive by removing the INBOX label.',
  {
    threadIds: z.array(z.string()).describe('Array of thread IDs to archive'),
  },
  async ({ threadIds }) => {
    try {
      const driver = await getMailDriver();
      const { threadIds: normalizedIds } = driver.normalizeIds(threadIds);
      await driver.modifyLabels(normalizedIds, { addLabels: [], removeLabels: ['INBOX'] });
      return { content: [{ type: 'text', text: `Successfully archived ${normalizedIds.length} threads.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'send_email',
  'Send a new email to one or multiple recipients.',
  {
    to: z.array(z.object({
      email: z.string().describe('Recipient email address'),
      name: z.string().optional().describe('Recipient name'),
    })),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body (HTML or plain text)'),
  },
  async (data) => {
    try {
      const driver = await getMailDriver();
      await driver.create({
        to: data.to,
        subject: data.subject,
        message: data.body,
        attachments: [],
        headers: {},
      });
      return { content: [{ type: 'text', text: 'Email sent successfully.' }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'list_labels',
  'List all available mail labels/folders.',
  {},
  async () => {
    try {
      const driver = await getMailDriver();
      const labels = await driver.getUserLabels();
      const result = labels.map((l: any) => ({ id: l.id, name: l.name, type: l.type }));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  'unsubscribe',
  'Attempt to unsubscribe from a mailing list for a specific thread.',
  {
    threadId: z.string().describe('The ID of the thread to unsubscribe from'),
  },
  async ({ threadId }) => {
    logToolUsage('get_email_content', { threadId });
    try {
      const driver = await getMailDriver();
      const thread = await driver.get(threadId);
      const lastMsg = thread.messages[thread.messages.length - 1];
      if (!lastMsg?.listUnsubscribe) {
        return { content: [{ type: 'text', text: 'No unsubscribe headers found for this thread.' }] };
      }
      
      const urls = lastMsg.listUnsubscribe.split(',').map((s: string) => s.trim().replace(/[<>]/g, ''));
      const mailto = urls.find((u: string) => u.startsWith('mailto:'));
      const http = urls.find((u: string) => u.startsWith('http'));

      if (http) {
        return { content: [{ type: 'text', text: `Please visit this link to unsubscribe: ${http}` }] };
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
        return { content: [{ type: 'text', text: 'Unsubscribe email has been sent.' }] };
      }
      return { content: [{ type: 'text', text: 'Unsupported unsubscribe method found.' }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// Setup Server based on Transport Mode
async function main() {
  const isSSE = process.env.MCP_TRANSPORT === 'sse';
  const apiKey = process.env.MCP_API_KEY;

  if (isSSE) {
    if (!apiKey) {
      console.warn('WARNING: Starting SSE server without MCP_API_KEY. Anyone can access this server!');
    }

    const app = express();
    app.use(cors());

    // Security Middleware
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      
      const providedKey = req.header('Authorization')?.replace('Bearer ', '') || req.header('X-API-Key');
      if (apiKey && providedKey !== apiKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });

    app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.4.0' }));

    let transport: SSEServerTransport | null = null;

    app.get('/sse', async (req, res) => {
      console.log('New SSE connection established');
      transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      if (!transport) {
        res.status(400).json({ error: 'SSE connection not established' });
        return;
      }
      await transport.handlePostMessage(req, res);
    });

    const port = Number(process.env.PORT) || 5008;
    app.listen(port, () => {
      console.error(`Mail-Zero MCP Server running on SSE at http://127.0.0.1:${port}`);
    });
  } else {
    // Standard Stdio Transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Mail-Zero MCP Server running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
