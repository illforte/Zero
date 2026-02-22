import { activeDriverProcedure, router } from '../trpc.js';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { env } from '../../env.js';
import { z } from 'zod';

export const brainRouter = router({
  chat: activeDriverProcedure
    .input(z.object({ message: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const litellm = createOpenAI({ apiKey: env.LITELLM_VIRTUAL_KEY, baseURL: env.LITELLM_BASE_URL });
      
      const { text, toolCalls } = await generateText({
        model: litellm(env.LITELLM_MODEL || 'llama'),
        system: 'You are a helpful email assistant. Help the user manage their emails. You have tools to tag cloudflare emails. Only use tools when explicitly asked.',
        prompt: input.message,
        tools: {
          tagCloudflare: tool({
            description: 'Tag all emails from Cloudflare with the Cloudflare label',
            parameters: z.object({}),
            execute: async () => {
              const threads = await ctx.driver.list({
                folder: 'inbox',
                query: 'from:cloudflare.com',
                maxResults: 100,
              });
              if (threads.threads.length > 0) {
                const threadIds = threads.threads.map(t => t.id);
                await ctx.driver.modifyLabels(threadIds, { addLabels: ['Cloudflare'], removeLabels: [] });
                return `Successfully tagged ${threads.threads.length} Cloudflare emails.`;
              }
              return 'No Cloudflare emails found.';
            }
          }),
          listThreads: tool({
            description: 'List emails in inbox',
            parameters: z.object({ query: z.string().optional() }),
            execute: async ({ query }) => {
              const threads = await ctx.driver.list({ folder: 'inbox', query, maxResults: 5 });
              return `Found ${threads.threads.length} threads.`;
            }
          })
        },
        maxSteps: 3,
      });

      return { response: text, toolCalls };
    }),
});
