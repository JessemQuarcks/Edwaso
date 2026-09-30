import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from './crypto.js';

// Where uploaded images live. The local-disk store suits one API server; for several servers or
// serverless, implement ImageStore against S3/Cloudinary and swap it in here.

export interface ImageStore {
  /** Saves the bytes and returns the public URL. */
  save(data: Buffer, ext: ImageExt): Promise<string>;
  /** Deletes a file previously returned by save(); ignores URLs it didn't create. */
  remove(url: string): Promise<void>;
}

export type ImageExt = 'jpg' | 'png' | 'webp' | 'gif';

/** Identifies the image type from its first bytes. Never trust the filename or Content-Type. */
export function sniffImage(data: Buffer): ImageExt | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
export const UPLOAD_PATH = '/uploads';

/** The API's public origin, used to build absolute image URLs for the storefront and Stripe. */
const publicOrigin = () => (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 5000}`).replace(/\/$/, '');

class LocalImageStore implements ImageStore {
  async save(data: Buffer, ext: ImageExt): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${randomToken(16)}.${ext}`;
    await writeFile(path.join(UPLOAD_DIR, name), data, { flag: 'wx' });
    return `${publicOrigin()}${UPLOAD_PATH}/${name}`;
  }

  async remove(url: string): Promise<void> {
    const prefix = `${publicOrigin()}${UPLOAD_PATH}/`;
    if (!url.startsWith(prefix)) return;
    const name = url.slice(prefix.length);
    // Only files this store could have written: random token + known extension, no path parts.
    if (!/^[\w-]+\.(jpg|png|webp|gif)$/.test(name)) return;
    await unlink(path.join(UPLOAD_DIR, name)).catch(() => undefined);
  }
}

export const imageStore: ImageStore = new LocalImageStore();
