import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const app = new Hono();

// Helper: mailparser AddressObject can be single or array — extract text safely
const getAddressText = (addr: any): string | undefined =>
  Array.isArray(addr) ? addr[0]?.text : addr?.text;

// CORS middleware
app.use('*', cors({
  origin: ['https://mail-api.lair404.xyz', 'https://mail.lair404.xyz'],
  credentials: true,
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'IMAP Proxy is running' });
});

// Schemas
const ImapConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  user: z.string(),
  password: z.string(),
  tls: z.boolean().default(true),
});

const ListEmailsSchema = z.object({
  config: ImapConfigSchema,
  folder: z.string().default('INBOX'),
  maxResults: z.number().default(50),
  search: z.array(z.string()).optional(),
});

const GetEmailSchema = z.object({
  config: ImapConfigSchema,
  folder: z.string().default('INBOX'),
  uid: z.number(),
});

const SendEmailSchema = z.object({
  smtp: z.object({
    host: z.string(),
    port: z.number(),
    secure: z.boolean().default(true),
    user: z.string(),
    password: z.string(),
  }),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  html: z.string().optional(),
  text: z.string().optional(),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
});

// List emails
app.post('/api/imap/list', async (c) => {
  try {
    const body = await c.req.json();
    const { config, folder, maxResults, search } = ListEmailsSchema.parse(body);

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const emails = await new Promise<any[]>((resolve, reject) => {
      const results: any[] = [];

      imap.once('ready', () => {
        imap.openBox(folder, true, (err, box) => {
          if (err) return reject(err);

          const searchCriteria = search || ['ALL'];

          imap.search(searchCriteria, (err, uids) => {
            if (err) return reject(err);
            if (!uids || uids.length === 0) {
              imap.end();
              return resolve([]);
            }

            // Get last N emails
            const targetUids = uids.slice(-maxResults);
            const fetch = imap.fetch(targetUids, { bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)', struct: true });

            fetch.on('message', (msg, seqno) => {
              const email: any = { uid: seqno };

              msg.on('body', (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) return;
                  email.from = getAddressText(parsed.from);
                  email.to = getAddressText(parsed.to);
                  email.subject = parsed.subject;
                  email.date = parsed.date;
                  email.messageId = parsed.messageId;
                  email.inReplyTo = parsed.inReplyTo;
                  email.references = parsed.references;
                });
              });

              msg.once('attributes', (attrs) => {
                email.flags = attrs.flags;
                email.uid = attrs.uid;
              });

              msg.once('end', () => {
                results.push(email);
              });
            });

            fetch.once('error', reject);
            fetch.once('end', () => {
              imap.end();
              resolve(results);
            });
          });
        });
      });

      imap.once('error', reject);
      imap.connect();
    });

    return c.json({ success: true, emails });
  } catch (error: any) {
    console.error('List emails error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get single email
app.post('/api/imap/get', async (c) => {
  try {
    const body = await c.req.json();
    const { config, folder, uid } = GetEmailSchema.parse(body);

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const email = await new Promise<any>((resolve, reject) => {
      imap.once('ready', () => {
        imap.openBox(folder, false, (err) => {
          if (err) return reject(err);

          const fetch = imap.fetch([uid], { bodies: '' });

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) return reject(err);

                imap.end();
                resolve({
                  from: getAddressText(parsed.from),
                  to: getAddressText(parsed.to),
                  cc: getAddressText(parsed.cc),
                  bcc: getAddressText(parsed.bcc),
                  subject: parsed.subject,
                  date: parsed.date,
                  messageId: parsed.messageId,
                  inReplyTo: parsed.inReplyTo,
                  references: parsed.references,
                  html: parsed.html,
                  text: parsed.text,
                  attachments: parsed.attachments?.map(att => ({
                    filename: att.filename,
                    contentType: att.contentType,
                    size: att.size,
                  })),
                });
              });
            });
          });

          fetch.once('error', reject);
        });
      });

      imap.once('error', reject);
      imap.connect();
    });

    return c.json({ success: true, email });
  } catch (error: any) {
    console.error('Get email error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Mark as read/unread
app.post('/api/imap/mark-read', async (c) => {
  try {
    const body = await c.req.json();
    const { config, folder = 'INBOX', uids, read = true } = body;

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    await new Promise<void>((resolve, reject) => {
      imap.once('ready', () => {
        imap.openBox(folder, false, (err) => {
          if (err) return reject(err);

          const flag = read ? '\\Seen' : '';
          const action = read ? 'addFlags' : 'delFlags';

          imap[action](uids, flag, (err) => {
            if (err) return reject(err);
            imap.end();
            resolve();
          });
        });
      });

      imap.once('error', reject);
      imap.connect();
    });

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Send email
app.post('/api/smtp/send', async (c) => {
  try {
    const body = await c.req.json();
    const emailData = SendEmailSchema.parse(body);

    const transporter = nodemailer.createTransport({
      host: emailData.smtp.host,
      port: emailData.smtp.port,
      secure: emailData.smtp.secure,
      auth: {
        user: emailData.smtp.user,
        pass: emailData.smtp.password,
      },
    });

    const info = await transporter.sendMail({
      from: emailData.from,
      to: emailData.to.join(', '),
      cc: emailData.cc?.join(', '),
      bcc: emailData.bcc?.join(', '),
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      inReplyTo: emailData.inReplyTo,
      references: emailData.references?.join(' '),
    });

    return c.json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error('Send email error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// List folders
app.post('/api/imap/folders', async (c) => {
  try {
    const body = await c.req.json();
    const config = ImapConfigSchema.parse(body);

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const folders = await new Promise<any[]>((resolve, reject) => {
      imap.once('ready', () => {
        imap.getBoxes((err, boxes) => {
          if (err) return reject(err);
          imap.end();
          resolve(Object.keys(boxes));
        });
      });

      imap.once('error', reject);
      imap.connect();
    });

    return c.json({ success: true, folders });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

const port = Number(process.env.PORT) || 3060;

console.log(`🚀 IMAP Proxy starting on port ${port}`);

// Start the server
import { serve } from '@hono/node-server';

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ IMAP Proxy listening on http://localhost:${info.port}`);
});
