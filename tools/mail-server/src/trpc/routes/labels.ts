import { activeDriverProcedure, router } from '../trpc.js';
import { z } from 'zod';

export const labelsRouter = router({
  list: activeDriverProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          color: z
            .object({
              backgroundColor: z.string(),
              textColor: z.string(),
            })
            .optional(),
          type: z.string(),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      return await ctx.driver.getUserLabels();
    }),

  create: activeDriverProcedure
    .input(
      z.object({
        name: z.string(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .default({ backgroundColor: '', textColor: '' }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.driver.createLabel(input);
    }),

  update: activeDriverProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...label } = input;
      return await ctx.driver.updateLabel(id, label);
    }),

  delete: activeDriverProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.driver.deleteLabel(input.id);
    }),
});
