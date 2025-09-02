/* eslint-disable */
import { createRateLimiterMiddleware, privateProcedure, router } from '../trpc';
import type { ToolDefinition } from '@arcadeai/arcadejs/resources/tools/tools';
import { Ratelimit } from '@upstash/ratelimit';
import { Arcade } from '@arcadeai/arcadejs';
import { TRPCError } from '@trpc/server';
import { env } from '../../env';
import { z } from 'zod';

const getArcadeClient = () => {
  if (!env.ARCADE_API_KEY) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Arcade API key not configured',
    });
  }
  return new Arcade({ apiKey: env.ARCADE_API_KEY });
};

interface ToolkitInfo {
  name: string;
  description: string;
  toolCount: number;
  tools: ToolDefinition[];
}

const authCache = new Map<string, string>();

export const arcadeConnections = router({
  toolkits: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-toolkits-${sessionUser?.id}`,
      }),
    )
    .query(async () => {
      try {
        const arcade = getArcadeClient();
        const githubTools = await arcade.tools.list({ toolkit: 'github' });
        const linearTools = await arcade.tools.list({ toolkit: 'linear' });
        // const stripeTools = await arcade.tools.list({ toolkit: 'stripe' });

        const allTools = [...githubTools.items, ...linearTools.items];

        const groupedToolkits = allTools.reduce(
          (acc: Record<string, ToolkitInfo>, tool: ToolDefinition) => {
            const toolkitName = tool.toolkit?.name || 'default';
            if (!acc[toolkitName]) {
              acc[toolkitName] = {
                name: toolkitName,
                description: tool.toolkit?.description || `${toolkitName} toolkit`,
                toolCount: 0,
                tools: [],
              };
            }
            acc[toolkitName].toolCount++;
            acc[toolkitName].tools.push(tool);
            return acc;
          },
          {},
        );

        return { toolkits: Object.values(groupedToolkits) };
      } catch (error) {
        console.error('Failed to fetch Arcade toolkits:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch toolkits',
        });
      }
    }),

  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-connections-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      try {
        const arcade = getArcadeClient();

        const connections = await arcade.admin.userConnections.list({ user: ctx.sessionUser.id });

        return { connections: connections.items };
      } catch (error) {
        console.error('[Arcade List Connections] Unexpected error:', error);

        // Log the error details for debugging
        if (error && typeof error === 'object') {
          console.error('[Arcade] Error details:', {
            message: (error as Error).message,
            status: (error as { status?: number }).status,
            data: (error as { data?: unknown }).data,
          });
        }

        return { connections: [] };
      }
    }),

  getAuthUrl: privateProcedure
    .input(z.object({ toolkit: z.string() }))
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(30, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-auth-${sessionUser?.id}`,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const arcade = getArcadeClient();
        const authResponse = await arcade.auth.start(ctx.sessionUser.id, input.toolkit, {
          providerType: 'oauth2',
          scopes: [],
        });

        if (authResponse.status === 'completed') {
          authCache.set(`${ctx.sessionUser.id}-${authResponse.id}`, input.toolkit);
          return { status: 'completed' };
        }

        if (authResponse.id) {
          authCache.set(`${ctx.sessionUser.id}-${authResponse.id}`, input.toolkit);
        }

        return {
          authUrl: authResponse.url || '',
          authId: authResponse.id || ctx.sessionUser.id,
        };
      } catch (error) {
        console.error('Failed to start Arcade authorization:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start authorization',
        });
      }
    }),

  createConnection: privateProcedure
    .input(
      z.object({
        toolkit: z.string(),
        authId: z.string(),
      }),
    )
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(30, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-create-${sessionUser?.id}`,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const arcade = getArcadeClient();

        const authStatus = await arcade.auth.status({ id: input.authId });

        if (authStatus.status !== 'completed') {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Authorization not completed or failed',
          });
        }

        authCache.set(`${ctx.sessionUser.id}-${input.authId}`, input.toolkit);

        return {
          success: true,
          connection: {
            id: `${ctx.sessionUser.id}-${input.toolkit}`,
            userId: ctx.sessionUser.id,
            toolkit: input.toolkit,
            status: 'connected' as const,
            authorizedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        console.error('Failed to create Arcade connection:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create connection',
        });
      }
    }),

  revoke: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(30, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-revoke-${sessionUser?.id}`,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const arcade = getArcadeClient();

        await arcade.admin.userConnections.delete(input.connectionId, {
          body: {
            user: ctx.sessionUser.id,
            provider: input.connectionId.split('-')[1],
          },
        });

        return { success: true };
      } catch (error) {
        console.error('Failed to revoke Arcade authorization:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke authorization',
        });
      }
    }),

  getAvailableTools: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(60, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:arcade-available-tools-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      try {
        const arcade = getArcadeClient();

        const connections = await arcade.admin.userConnections.list({ user: ctx.sessionUser.id });

        if (!connections.items || connections.items.length === 0) {
          return { tools: [] };
        }

        const availableTools: Array<{
          toolkit: string;
          toolName: string;
          description: string;
          parameters: Record<string, unknown>;
        }> = [];

        for (const connection of connections.items) {
          const toolkit = connection.provider_id?.split('-')[0];
          if (!toolkit) continue;

          try {
            const toolsList = await arcade.tools.list({ toolkit });

            for (const tool of toolsList.items) {
              const toolWithDef = tool as ToolDefinition & {
                definition?: {
                  description?: string;
                  parameters?: Record<string, unknown>;
                };
              };
              const toolDefinition = toolWithDef.definition || {};
              availableTools.push({
                toolkit,
                toolName: tool.name,
                description: toolDefinition.description || `${tool.name} from ${toolkit}`,
                parameters: toolDefinition.parameters || {},
              });
            }
          } catch (error) {
            console.error(`[Arcade] Failed to fetch tools for toolkit ${toolkit}:`, error);
          }
        }

        console.log(
          `[Arcade] Found ${availableTools.length} tools across ${connections.items.length} toolkits`,
        );

        return { tools: availableTools };
      } catch (error) {
        console.error('[Arcade Get Available Tools] Error:', error);
        return { tools: [] };
      }
    }),
});
