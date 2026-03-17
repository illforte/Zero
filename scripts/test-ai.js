import { appRouter } from './dist/trpc/index.js';
import { getDb } from './dist/db/index.js';

async function run() {
  const db = getDb();
  let sessionUser = await db.query.user.findFirst();

  if (!sessionUser) {
     throw new Error("No user found");
  }

  const caller = appRouter.createCaller({
    c: {},
    sessionUser: sessionUser,
    auth: {},
    db: db
  });

  console.log("Asking AI: 'Please tag all my cloudflare emails.'");
  const response = await caller.brain.chat({ message: "Please tag all my cloudflare emails." });

  console.log("AI Response:", response.response);
  console.log("Tool Calls:", JSON.stringify(response.toolCalls, null, 2));
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
