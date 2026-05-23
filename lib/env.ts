import Constants from 'expo-constants';
import { z } from 'zod';

const EnvSchema = z.object({
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(10),
  spotifyClientId: z.string().optional(),
  sentryDsn: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  env: z.enum(['development', 'preview', 'production']).default('development'),
});

const parsed = EnvSchema.safeParse(Constants.expoConfig?.extra);

if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration. Check .env.local against .env.example.\n${parsed.error.message}`,
  );
}

export const env = parsed.data;
