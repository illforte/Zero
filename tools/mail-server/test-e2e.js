import { getDb } from './dist/db/index.js';
import { ImapMailManager } from './dist/driver/imap.js';
import nodemailer from 'nodemailer';

async function testE2E() {
  const db = getDb();
  console.log("Fetching IMAP connections from DB...");
  const connections = await db.query.connection.findMany({
    where: (connections, { eq }) => eq(connections.providerId, 'imap')
  });

  const mailConn = connections.find(c => c.email === 'mail@n1njanode.com');

  const mailDriver = new ImapMailManager({
    auth: {
      email: mailConn.email,
      accessToken: mailConn.accessToken || '',
      refreshToken: mailConn.refreshToken || '',
      userId: mailConn.userId
    }
  });

  console.log(`\nTesting Send Mail via Nodemailer directly to SMTP...`);
  const testSubject = `E2E Final Nodemailer SMTP Send Mail ${new Date().getTime()}`;
  
  const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 465,
    secure: true,
    auth: {
        user: mailConn.email,
        pass: mailConn.accessToken || ''
    },
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.sendMail({
      from: '"Mail" <mail@n1njanode.com>',
      to: 'mail@n1njanode.com',
      subject: testSubject,
      text: 'This is a test message to ensure receiving works after the wipe.',
    });
    console.log(`Sent message successfully.`);
  } catch (e) {
    console.error(`Failed to send message: ${e.message}`);
  }

  console.log('\nWaiting 5 seconds for mail delivery...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`\nVerifying Receive in mail@n1njanode.com Inbox...`);
  const receiverInboxRaw = await mailDriver.proxyRequest('/api/imap/list', {
      config: mailDriver.imapConfig,
      folder: 'INBOX',
      maxResults: 50,
      bypassCache: true
  });
  console.log(`Found ${receiverInboxRaw.emails.length} threads in Inbox.`);
  
  let foundUid = null;
  for (const t of receiverInboxRaw.emails) {
      if (t.subject === testSubject) {
         console.log(`- SUCCESS! Found in inbox: UID ${t.uid} : ${t.subject}`);
         foundUid = t.uid;
         break;
      }
  }

  if (!foundUid) {
      console.log(`FAILED! The email did not arrive.`);
      for (const t of receiverInboxRaw.emails) {
          console.log(`  Existing: ${t.uid} : ${t.subject}`);
      }
  } else {
      console.log(`SUCCESS! Mail works.`);
  }

  console.log('\nE2E testing complete.');
  process.exit(0);
}

testE2E().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
