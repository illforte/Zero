import { privateProcedure, publicProcedure, router } from '../trpc.js';
import { getNodeZeroDB } from '../../db/node-zero-db.js';
import { z } from 'zod';

const userSettingsSchema = z.object({
  language: z.string(),
  timezone: z.string(),
  dynamicContent: z.boolean().optional(),
  externalImages: z.boolean(),
  customPrompt: z.string().default(''),
  isOnboarded: z.boolean().optional(),
  trustedSenders: z.string().array().optional(),
  colorTheme: z.enum(['light', 'dark', 'system']).default('system'),
  zeroSignature: z.boolean().default(true),
  categories: z.array(z.any()).optional(),
  defaultEmailAlias: z.string().optional(),
  imageCompression: z.enum(['low', 'medium', 'original']).default('medium'),
  autoRead: z.boolean().default(true),
  animations: z.boolean().default(false),
});

const defaultUserSettings = {
  language: 'en',
  timezone: 'UTC',
  dynamicContent: false,
  externalImages: true,
  customPrompt: '',
  trustedSenders: [] as string[],
  isOnboarded: false,
  colorTheme: 'system' as const,
  zeroSignature: true,
  autoRead: true,
  defaultEmailAlias: '',
  imageCompression: 'medium' as const,
  animations: false,
};

export const settingsRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionUser) return { settings: defaultUserSettings };

    const zeroDB = getNodeZeroDB(ctx.db, ctx.sessionUser.id);
    const result = await zeroDB.findUserSettings();

    if (!result) return { settings: defaultUserSettings };

    const parsed = userSettingsSchema.safeParse(result.settings);
    if (!parsed.success) {
      zeroDB.updateUserSettings(defaultUserSettings).catch(console.error);
      return { settings: defaultUserSettings };
    }

    return { settings: parsed.data };
  }),

  save: privateProcedure
    .input(userSettingsSchema.partial())
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.zeroDB.findUserSettings();

      if (existing) {
        const newSettings = { ...(existing.settings as object), ...input };
        await ctx.zeroDB.updateUserSettings(newSettings);
      } else {
        await ctx.zeroDB.insertUserSettings({ ...defaultUserSettings, ...input });
      }

      return { success: true };
    }),
});
