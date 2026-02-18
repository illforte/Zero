import { privateProcedure, router } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

export const templatesRouter = router({
  list: privateProcedure.query(async ({ ctx }) => {
    const templates = await ctx.zeroDB.listEmailTemplates();
    return { templates };
  }),

  create: privateProcedure
    .input(
      z.object({
        name: z.string().min(1),
        subject: z.string().default(''),
        body: z.string().default(''),
        to: z.array(z.string()).optional(),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.name.length > 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Template name must be at most 100 characters' });
      }

      const existing = await ctx.zeroDB.listEmailTemplates();
      const nameExists = existing.some(
        (t) => t.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (nameExists) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A template named "${input.name}" already exists.`,
        });
      }

      const [template] = await ctx.zeroDB.createEmailTemplate({
        id: uuidv4(),
        name: input.name,
        subject: input.subject || null,
        body: input.body || null,
        to: input.to || null,
        cc: input.cc || null,
        bcc: input.bcc || null,
      });
      return { template };
    }),

  delete: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.zeroDB.deleteEmailTemplate(input.id);
      return { success: true };
    }),
});
