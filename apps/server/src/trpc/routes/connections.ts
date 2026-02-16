import { TRPCError } from '@trpc/server';
import { Ratelimit } from '@upstash/ratelimit';
import { z } from 'zod';
import { getActiveConnection, getZeroDB } from '../../lib/server-utils';
import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';

export const connectionsRouter = router({
  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(120, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:get-connections-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);
      const connections = await db.findManyConnections();

      const disconnectedIds = connections
        .filter((c) => !c.accessToken || !c.refreshToken)
        .map((c) => c.id);

      return {
        connections: connections.map((connection) => {
          return {
            id: connection.id,
            email: connection.email,
            name: connection.name,
            picture: connection.picture,
            createdAt: connection.createdAt,
            providerId: connection.providerId,
          };
        }),
        disconnectedIds,
      };
    }),
  setDefault: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = await getZeroDB(user.id);
      const foundConnection = await db.findUserConnection(connectionId);
      if (!foundConnection) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.updateUser({ defaultConnectionId: connectionId });
    }),
  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = await getZeroDB(user.id);
      await db.deleteConnection(connectionId);

      const activeConnection = await getActiveConnection();
      if (connectionId === activeConnection.id) await db.updateUser({ defaultConnectionId: null });
    }),
  linkLair404: privateProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
        imapHost: z.string().default('mail.lair404.xyz'),
        imapPort: z.number().default(993),
        smtpHost: z.string().default('mail.lair404.xyz'),
        smtpPort: z.number().default(587),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { email, password, imapHost, imapPort, smtpHost, smtpPort } = input;
      const { sessionUser } = ctx;

      // Import inside mutation to keep logic contained or at top level if preferred
      const { verifyLair404Credentials } = await import('../../lib/driver/lair404-verify');
      const { encrypt } = await import('../../lib/crypto');

      try {
        await verifyLair404Credentials({
          email,
          password,
          imapHost,
          imapPort,
          smtpHost,
          smtpPort,
        });
      } catch (error: any) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error.message || 'Failed to verify Lair404 credentials',
        });
      }

      const db = await getZeroDB(sessionUser.id);
      const encryptedPassword = await encrypt(password);
      
      const config = {
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
        password: encryptedPassword,
      };

      const [result] = await db.createConnection(
        'lair404' as any,
        email,
        {
          name: email.split('@')[0],
          picture: '',
          accessToken: JSON.stringify(config),
          refreshToken: 'lair404-relay',
          scope: 'lair404',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      );

      return { success: true, connectionId: result.id };
    }),
  getDefault: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionUser) return null;
    const connection = await getActiveConnection();
    return {
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
    };
  }),
});
