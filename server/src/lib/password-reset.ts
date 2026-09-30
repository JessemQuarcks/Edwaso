import type { UserDoc } from '../models/User.js';
import { randomToken, sha256 } from './crypto.js';
import { sendPasswordReset } from './emails.js';

export const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a one-time reset link and emails it. Replaces any earlier link. The token itself only
 * ever exists in the email; the database keeps its hash.
 */
export async function startPasswordReset(user: UserDoc) {
  const token = randomToken();
  user.resetTokenHash = sha256(token);
  user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();
  return sendPasswordReset(user, token);
}
