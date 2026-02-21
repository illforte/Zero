import { privateProcedure, publicProcedure, router } from '../trpc.js';
import { getNodeZeroDB } from '../../db/node-zero-db.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const connectionsRouter = router({
  list: privateProcedure.query(async ({ ctx }) => {
    const connections = await ctx.zeroDB.findManyConnections();

    const disconnectedIds = connections
      .filter((c) => !c.accessToken || !c.refreshToken)
      .map((c) => c.id);

    return {
      connections: connections.map((conn) => ({
        id: conn.id,
        email: conn.email,
        name: conn.name,
        picture: conn.picture,
        createdAt: conn.createdAt,
        providerId: conn.providerId,
      })),
      disconnectedIds,
    };
  }),

  setDefault: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const found = await ctx.zeroDB.findUserConnection(input.connectionId);
      if (!found) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.zeroDB.updateUser({ defaultConnectionId: input.connectionId });
    }),

  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Clear default if deleting the active connection
      const user = await ctx.zeroDB.findUser();
      if (user?.defaultConnectionId === input.connectionId) {
        await ctx.zeroDB.updateUser({ defaultConnectionId: null });
      }
      await ctx.zeroDB.deleteConnection(input.connectionId);
    }),

  updateImapCredentials: privateProcedure
    .input(
      z.object({
        connectionId: z.string(),
        imapUrl: z.string().startsWith('imap', { message: 'Must be an IMAP URL (imap:// or imaps://)' }),
        smtpUrl: z.string().startsWith('smtp', { message: 'Must be an SMTP URL (smtp:// or smtps://)' }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const found = await ctx.zeroDB.findUserConnection(input.connectionId);
      if (!found) throw new TRPCError({ code: 'NOT_FOUND' });
      if (found.providerId !== 'imap') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only IMAP connections support credential updates' });
      await ctx.zeroDB.updateConnection(input.connectionId, {
        accessToken: input.imapUrl,
        refreshToken: input.smtpUrl,
      });
    }),

  getDefault: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionUser) return null;
    const zeroDB = getNodeZeroDB(ctx.db, ctx.sessionUser.id);

    const userData = await zeroDB.findUser();
    let conn = null;

    if (userData?.defaultConnectionId) {
      conn = await zeroDB.findUserConnection(userData.defaultConnectionId);
    }
    if (!conn) {
      conn = await zeroDB.findFirstConnection();
    }
    if (!conn) return null;

    return {
      id: conn.id,
      email: conn.email,
      name: conn.name,
      picture: conn.picture,
      createdAt: conn.createdAt,
      providerId: conn.providerId,
    };
  }),
});
