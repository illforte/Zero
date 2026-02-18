import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { connectionsRouter } from './routes/connections.js';
import { templatesRouter } from './routes/templates.js';
import { settingsRouter } from './routes/settings.js';
import { draftsRouter } from './routes/drafts.js';
import { labelsRouter } from './routes/labels.js';
import { userRouter } from './routes/user.js';
import { mailRouter } from './routes/mail.js';
import { router } from './trpc.js';

export const appRouter = router({
  connections: connectionsRouter,
  drafts: draftsRouter,
  labels: labelsRouter,
  mail: mailRouter,
  settings: settingsRouter,
  templates: templatesRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;
