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
        system: `You are Fred, an intelligent email management assistant integrated directly into the Zero mail client.
Your mission: help users navigate and understand their inbox, and take action on their behalf.

CRITICAL RULES:
1. You have direct access to the user's mailbox via tools.
2. If a user asks you to do something (e.g., "tag cloudflare emails", "delete spam"), YOU MUST USE YOUR TOOLS TO DO IT.
3. NEVER tell the user how to do it themselves in Gmail, Outlook, or any other client. You are already inside their mail client.
4. Keep your responses concise. Just confirm the action you took (e.g., "I have tagged all your Cloudflare emails.").
5. Do not expose internal tool reasoning to the user.`,
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

  getPrompts: activeDriverProcedure.query(async () => {
    return [];
  }),

  generateSummary: activeDriverProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async () => {
      return null;
    }),
});
