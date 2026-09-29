import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** High-entropy, URL-safe random token (256 bits by default). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * Plain SHA-256 is fine for the values hashed here (session ids, invite tokens, recovery codes):
 * they are random with enough entropy that a slow password hash adds nothing.
 */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function encryptionKey(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  return key;
}

// Format: v1.<iv>.<auth tag>.<ciphertext>, each part base64url.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decrypt(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
