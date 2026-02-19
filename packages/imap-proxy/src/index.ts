import { Hono } from 'hono';
import { cors } from 'hono/cors';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const app = new Hono();

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
    const { config, folder: _rawFolder, maxResults, search } = ListEmailsSchema.parse(body);
    // Map frontend folder names to Dovecot's actual IMAP folder names
    const folder: string = ({ Spam: 'Junk', spam: 'Junk' } as Record<string, string>)[_rawFolder] || _rawFolder;

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

            // Async race fix: pending counter defers resolve until ALL simpleParser callbacks finish
            let _pend = 0, _fdone = false;
            const _tryRes = () => { if (_fdone && _pend === 0) { imap.end(); resolve(results); } };

            fetch.on('message', (msg: any, seqno: number) => {
              _pend++;
              const email: any = { uid: seqno };
              let _pd = false, _ef = false;
              const _push = () => {
                if (_pd && _ef) { results.push(email); _pend--; _tryRes(); }
              };

              msg.on('body', (stream: any) => {
                simpleParser(stream, (err: any, parsed: any) => {
                  if (!err) {
                    email.from = parsed.from?.text;
                    email.to = parsed.to?.text;
                    email.subject = parsed.subject;
                    email.date = parsed.date;
                    email.messageId = parsed.messageId;
                    email.inReplyTo = parsed.inReplyTo;
                    email.references = parsed.references;
                  }
                  _pd = true; _push();
                });
              });

              msg.once('attributes', (attrs: any) => {
                email.flags = attrs.flags;
                email.uid = attrs.uid;
              });

              msg.once('end', () => { _ef = true; _push(); });
            });

            fetch.once('error', reject);
            fetch.once('end', () => { _fdone = true; _tryRes(); });
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

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream, (err: any, parsed: any) => {
                if (err) return reject(err);

                imap.end();
                resolve({
                  from: parsed.from?.text,
                  to: parsed.to?.text,
                  cc: parsed.cc?.text,
                  bcc: parsed.bcc?.text,
                  subject: parsed.subject,
                  date: parsed.date,
                  messageId: parsed.messageId,
                  inReplyTo: parsed.inReplyTo,
                  references: parsed.references,
                  html: parsed.html,
                  text: parsed.text,
                  attachments: parsed.attachments?.map((att: any) => ({
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

          (imap as any)[action](uids, flag, (err: any) => {
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

// Send email (with Sent folder append)
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
      tls: { rejectUnauthorized: false },
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

    // Append sent message to Sent folder via IMAP
    try {
      const rawMsg = await new Promise<Buffer>((resolve, reject) => {
        const streamTransport = nodemailer.createTransport({ streamTransport: true, newline: 'unix' } as any);
        const mailOpts = {
          from: emailData.from,
          to: emailData.to.join(', '),
          cc: emailData.cc?.join(', '),
          bcc: emailData.bcc?.join(', '),
          subject: emailData.subject,
          text: emailData.text,
          html: emailData.html,
          inReplyTo: emailData.inReplyTo,
          references: emailData.references?.join(' '),
          messageId: info.messageId,
        };
        (streamTransport as any).sendMail(mailOpts, (err: any, inf: any) => {
          if (err) return reject(err);
          const chunks: Buffer[] = [];
          inf.message.on('data', (d: Buffer) => chunks.push(d));
          inf.message.on('end', () => resolve(Buffer.concat(chunks)));
          inf.message.on('error', reject);
        });
      });

      const sentImap = new Imap({
        user: emailData.smtp.user,
        password: emailData.smtp.password,
        host: emailData.smtp.host,
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
      } as any);

      await new Promise<void>((resolve, reject) => {
        sentImap.once('ready', () => {
          (sentImap as any).append(rawMsg, { mailbox: 'Sent', flags: ['\\Seen'] }, (err: any) => {
            sentImap.end();
            if (err) reject(err); else resolve();
          });
        });
        sentImap.once('error', reject);
        sentImap.connect();
      });
      console.log('[smtp/send] Appended to Sent folder, messageId:', info.messageId);
    } catch (appendErr: any) {
      console.error('[smtp/send] Sent folder append failed (non-fatal):', appendErr.message);
    }

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
