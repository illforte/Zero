import { privateProcedure, router } from '../trpc.js';

export const userRouter = router({
  delete: privateProcedure.mutation(async ({ ctx }) => {
    // Delete user via Better Auth API which cascades to all related records
    const result = await ctx.auth.api.deleteUser({
      body: { callbackURL: '/' },
      headers: ctx.c.req.raw.headers,
      request: ctx.c.req.raw,
    });
    return { success: result.success, message: result.message };
  }),
});
