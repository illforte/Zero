import { z } from 'zod';
import { publicProcedure, router } from '../trpc.js';

// BIMI (Brand Indicators for Message Identification) — stub for self-hosted.
// The cloud version looks up brand logos; in self-hosted we return null.
export const bimiRouter = router({
  getByEmail: publicProcedure
    .input(z.object({ email: z.string() }))
    .query(() => null),
});
