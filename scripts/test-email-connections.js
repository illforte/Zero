import { getDb } from './dist/db/index.js';
import { GoogleMailManager } from './dist/driver/google.js';
import { ImapMailManager } from './dist/driver/imap.js';

async function testConnections() {
  const db = getDb();
  
  console.log("Fetching connections from DB...");
  const connections = await db.query.connection.findMany();
  
  for (const conn of connections) {
    console.log(`\nTesting connection: ${conn.email} (${conn.providerId})`);
    
    try {
      let driver;
      if (conn.providerId === 'google') {
        driver = new GoogleMailManager({ 
          auth: { 
            email: conn.email, 
            accessToken: conn.accessToken || '', 
            refreshToken: conn.refreshToken || '',
            userId: conn.userId
          } 
        });
      } else if (conn.providerId === 'imap') {
        driver = new ImapMailManager({
          auth: {
            email: conn.email,
            accessToken: conn.accessToken || '',
            refreshToken: conn.refreshToken || '',
            userId: conn.userId
          }
        });
      } else {
        console.log(`Skipping unknown provider: ${conn.providerId}`);
        continue;
      }

      console.log(`Fetching inbox for ${conn.email}...`);
      const threads = await driver.list({ folder: 'inbox', maxResults: 1 });
      console.log(`Success! Found ${threads.threads.length} threads in inbox.`);
      if (threads.threads.length > 0) {
        console.log(`Latest thread ID: ${threads.threads[0].id}`);
      }
    } catch (e) {
      console.error(`Error testing connection ${conn.email}:`, e.message);
    }
  }
  
  console.log("\nConnection testing complete.");
  process.exit(0);
}

testConnections().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
