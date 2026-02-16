import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';

export async function verifyLair404Credentials(config: {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}) {
  // 1. Verify IMAP
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: {
      user: config.email,
      pass: config.password,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
  } catch (error: any) {
    throw new Error(`IMAP verification failed: ${error.message}`);
  }

  // 2. Verify SMTP
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.email,
      pass: config.password,
    },
  });

  try {
    await transporter.verify();
  } catch (error: any) {
    throw new Error(`SMTP verification failed: ${error.message}`);
  }

  return true;
}
