import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Password must contain upper and lower case letters')
  .refine((v) => /\d/.test(v), 'Password must contain a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Password must contain a symbol');
