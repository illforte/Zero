import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { TrpcContext } from './context.js';
import { getNodeZeroDB } from '../db/node-zero-db.js';
import { createDriver } from '../driver/index.js';
import { schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const privateProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.sessionUser) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const zeroDB = getNodeZeroDB(ctx.db, ctx.sessionUser.id);
  return next({ ctx: { ...ctx, sessionUser: ctx.sessionUser, zeroDB } });
});

export const activeConnectionProcedure = privateProcedure.use(async ({ ctx, next }) => {
  const { sessionUser, db } = ctx;

  // Get user's default connection or first available
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.id, sessionUser.id),
  });

  let activeConnection = null;

  if (userData?.defaultConnectionId) {
    activeConnection = await db.query.connection.findFirst({
      where: eq(schema.connection.id, userData.defaultConnectionId),
    });
  }

  if (!activeConnection) {
    activeConnection = await db.query.connection.findFirst({
      where: eq(schema.connection.userId, sessionUser.id),
    });
  }

  if (!activeConnection) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No mail connection found for user',
    });
  }

  const driver = createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken || '',
      refreshToken: activeConnection.refreshToken || '',
      email: activeConnection.email,
    },
  });

  return next({ ctx: { ...ctx, activeConnection, driver } });
});

// Alias for procedures that need the driver
export const activeDriverProcedure = activeConnectionProcedure;
