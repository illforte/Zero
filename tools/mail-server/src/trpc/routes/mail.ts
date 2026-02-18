import { activeDriverProcedure, privateProcedure, router } from '../trpc.js';
import { IGetThreadResponseSchema, IGetThreadsResponseSchema } from '../../driver/types.js';
import { processEmailHtml } from '../../lib/email-processor.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const senderSchema = z.object({
  name: z.string().optional(),
  email: z.string(),
});

const serializedFileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  lastModified: z.number(),
  base64: z.string(),
});

const defaultPageSize = 20;

export const mailRouter = router({
  get: activeDriverProcedure
    .input(z.object({ id: z.string() }))
    .output(IGetThreadResponseSchema)
    .query(async ({ input, ctx }) => {
      return await ctx.driver.get(input.id);
    }),

  count: activeDriverProcedure
    .output(
      z.array(
        z.object({
          count: z.number().optional(),
          label: z.string().optional(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      return await ctx.driver.count();
    }),

  listThreads: activeDriverProcedure
    .input(
      z.object({
        folder: z.string().optional().default('inbox'),
        q: z.string().optional().default(''),
        maxResults: z.number().optional().default(defaultPageSize),
        cursor: z.string().optional().default(''),
        labelIds: z.array(z.string()).optional().default([]),
      }),
    )
    .output(IGetThreadsResponseSchema)
    .query(async ({ ctx, input }) => {
      const { folder, maxResults, cursor, q, labelIds } = input;

      // Handle drafts folder separately
      if (folder === 'draft') {
        return await ctx.driver.listDrafts({
          q,
          maxResults,
          pageToken: cursor,
        });
      }

      return await ctx.driver.list({
        folder,
        query: q,
        maxResults,
        labelIds,
        pageToken: cursor,
      });
    }),

  markAsRead: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.markAsRead(input.ids);
    }),

  markAsUnread: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.markAsUnread(input.ids);
    }),

  markAsImportant: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: ['IMPORTANT'], removeLabels: [] });
    }),

  modifyLabels: activeDriverProcedure
    .input(
      z.object({
        threadId: z.string().array(),
        addLabels: z.string().array().optional().default([]),
        removeLabels: z.string().array().optional().default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { threadId, addLabels, removeLabels } = input;
      const { threadIds } = ctx.driver.normalizeIds(threadId);

      if (threadIds.length) {
        await ctx.driver.modifyLabels(threadIds, { addLabels, removeLabels });
        return { success: true };
      }

      return { success: false, error: 'No label changes specified' };
    }),

  toggleStar: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      const { threadIds } = ctx.driver.normalizeIds(input.ids);

      if (!threadIds.length) {
        return { success: false, error: 'No thread IDs provided' };
      }

      const threadResults = await Promise.allSettled(
        threadIds.map((id) => ctx.driver.get(id)),
      );

      let anyStarred = false;
      let processedThreads = 0;

      for (const result of threadResults) {
        if (result.status === 'fulfilled' && result.value.messages.length > 0) {
          processedThreads++;
          const isStarred = result.value.messages.some((m) =>
            m.tags?.some((tag) => tag.name.toLowerCase().startsWith('starred')),
          );
          if (isStarred) {
            anyStarred = true;
            break;
          }
        }
      }

      const shouldStar = processedThreads > 0 && !anyStarred;
      await ctx.driver.modifyLabels(
        threadIds,
        { addLabels: shouldStar ? ['STARRED'] : [], removeLabels: shouldStar ? [] : ['STARRED'] },
      );

      return { success: true };
    }),

  toggleImportant: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      const { threadIds } = ctx.driver.normalizeIds(input.ids);

      if (!threadIds.length) {
        return { success: false, error: 'No thread IDs provided' };
      }

      const threadResults = await Promise.allSettled(
        threadIds.map((id) => ctx.driver.get(id)),
      );

      let anyImportant = false;
      let processedThreads = 0;

      for (const result of threadResults) {
        if (result.status === 'fulfilled' && result.value.messages.length > 0) {
          processedThreads++;
          const isImportant = result.value.messages.some((m) =>
            m.tags?.some((tag) => tag.name.toLowerCase().startsWith('important')),
          );
          if (isImportant) {
            anyImportant = true;
            break;
          }
        }
      }

      const shouldMarkImportant = processedThreads > 0 && !anyImportant;
      await ctx.driver.modifyLabels(
        threadIds,
        {
          addLabels: shouldMarkImportant ? ['IMPORTANT'] : [],
          removeLabels: shouldMarkImportant ? [] : ['IMPORTANT'],
        },
      );

      return { success: true };
    }),

  bulkStar: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: ['STARRED'], removeLabels: [] });
    }),

  bulkMarkImportant: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: ['IMPORTANT'], removeLabels: [] });
    }),

  bulkUnstar: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: [], removeLabels: ['STARRED'] });
    }),

  bulkUnmarkImportant: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: [], removeLabels: ['IMPORTANT'] });
    }),

  deleteAllSpam: activeDriverProcedure.mutation(async ({ ctx }) => {
    try {
      return await ctx.driver.deleteAllSpam();
    } catch (error) {
      return { success: false, message: 'Failed to delete spam', error: String(error), count: 0 };
    }
  }),

  send: activeDriverProcedure
    .input(
      z.object({
        to: z.array(senderSchema),
        subject: z.string(),
        message: z.string(),
        attachments: z.array(serializedFileSchema).optional().default([]),
        headers: z.record(z.string()).optional().default({}),
        cc: z.array(senderSchema).optional(),
        bcc: z.array(senderSchema).optional(),
        threadId: z.string().optional(),
        fromEmail: z.string().optional(),
        draftId: z.string().optional(),
        isForward: z.boolean().optional(),
        originalMessage: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { draftId, ...mail } = input;

      if (draftId) {
        await ctx.driver.sendDraft(draftId, mail);
      } else {
        await ctx.driver.create(input);
      }

      return { success: true };
    }),

  delete: activeDriverProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.delete(input.id);
    }),

  bulkDelete: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: ['TRASH'], removeLabels: [] });
    }),

  bulkArchive: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: [], removeLabels: ['INBOX'] });
    }),

  bulkMute: activeDriverProcedure
    .input(z.object({ ids: z.string().array() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.modifyLabels(input.ids, { addLabels: ['MUTE'], removeLabels: [] });
    }),

  getEmailAliases: activeDriverProcedure.query(async ({ ctx }) => {
    return ctx.driver.getEmailAliases();
  }),

  getMessageAttachments: activeDriverProcedure
    .input(z.object({ messageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.driver.getMessageAttachments(input.messageId);
    }),

  processEmailContent: privateProcedure
    .input(
      z.object({
        html: z.string(),
        shouldLoadImages: z.boolean(),
        theme: z.enum(['light', 'dark']),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const { processedHtml, hasBlockedImages } = processEmailHtml({
          html: input.html,
          shouldLoadImages: input.shouldLoadImages,
          theme: input.theme,
        });

        return { processedHtml, hasBlockedImages };
      } catch (error) {
        console.error('Error processing email content:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process email content',
        });
      }
    }),
});
