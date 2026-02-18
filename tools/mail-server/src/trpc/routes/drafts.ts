import { activeDriverProcedure, router } from '../trpc.js';
import { createDraftData } from '../../driver/types.js';
import { z } from 'zod';

export const draftsRouter = router({
  create: activeDriverProcedure
    .input(createDraftData)
    .mutation(async ({ input, ctx }) => {
      return ctx.driver.createDraft(input);
    }),

  get: activeDriverProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.driver.getDraft(input.id);
    }),

  list: activeDriverProcedure
    .input(
      z.object({
        q: z.string().optional(),
        maxResults: z.number().optional(),
        pageToken: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return ctx.driver.listDrafts(input);
    }),
});
