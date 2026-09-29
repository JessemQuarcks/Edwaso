import { z } from 'zod';
import { HttpError } from './error.js';

/** Parses untrusted input with a zod schema, turning the first issue into a 400. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.join('.');
  // Our schemas give friendly messages; zod's defaults need the field name to make sense.
  const message =
    issue && issue.message.startsWith('Invalid input') && path
      ? `${path}: ${issue.message}`
      : (issue?.message ?? 'Invalid request');
  throw new HttpError(400, message);
}

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const passwordSchema = (min: number) =>
  z
    .string({ error: 'Password is required' })
    .min(min, `Password must be at least ${min} characters`)
    // bcrypt ignores everything past 72 bytes.
    .max(72, 'Password must be at most 72 characters');
