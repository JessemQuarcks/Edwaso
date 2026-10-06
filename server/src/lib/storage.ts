import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from './crypto.js';

// Where uploaded images live. The local-disk store suits one API server with a persistent disk;
// with CLOUDINARY_URL set, images go to Cloudinary instead (hosts whose disk is wiped on restart).

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

const CLOUDINARY_FOLDER = 'uploads';

/** Stores images on Cloudinary via its signed REST API. Configured by CLOUDINARY_URL. */
export class CloudinaryImageStore implements ImageStore {
  private readonly cloud: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  /** `cloudinaryUrl` is Cloudinary's standard `cloudinary://<api_key>:<api_secret>@<cloud_name>`. */
  constructor(cloudinaryUrl: string) {
    const url = new URL(cloudinaryUrl);
    if (url.protocol !== 'cloudinary:' || !url.username || !url.password || !url.hostname) {
      throw new Error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>');
    }
    this.cloud = url.hostname;
    this.apiKey = decodeURIComponent(url.username);
    this.apiSecret = decodeURIComponent(url.password);
  }

  /** Signed request: params sorted by name, joined as a query string, then the secret, sha1'd. */
  private async call(action: 'upload' | 'destroy', params: Record<string, string>, file?: Blob): Promise<Record<string, unknown>> {
    const signed: Record<string, string> = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
    const toSign = Object.keys(signed)
      .sort()
      .map((k) => `${k}=${signed[k]}`)
      .join('&');
    const body = new FormData();
    for (const [k, v] of Object.entries(signed)) body.append(k, v);
    body.append('api_key', this.apiKey);
    body.append('signature', createHash('sha1').update(toSign + this.apiSecret).digest('hex'));
    if (file) body.append('file', file);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cloud}/image/${action}`, { method: 'POST', body });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = (json.error as { message?: string } | undefined)?.message ?? res.statusText;
      throw new Error(`Cloudinary ${action} failed: ${message}`);
    }
    return json;
  }

  async save(data: Buffer, ext: ImageExt): Promise<string> {
    const file = new Blob([new Uint8Array(data)], { type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` });
    const { secure_url } = await this.call('upload', { folder: CLOUDINARY_FOLDER }, file);
    if (typeof secure_url !== 'string') throw new Error('Cloudinary upload returned no URL');
    return secure_url;
  }

  async remove(url: string): Promise<void> {
    const prefix = `https://res.cloudinary.com/${this.cloud}/image/upload/`;
    if (!url.startsWith(prefix)) return;
    // <prefix>[v123/]uploads/<id>.<ext> → public_id "uploads/<id>"
    const publicId = url
      .slice(prefix.length)
      .replace(/^v\d+\//, '')
      .replace(/\.\w+$/, '');
    if (!publicId.startsWith(`${CLOUDINARY_FOLDER}/`)) return;
    await this.call('destroy', { public_id: publicId }).catch(() => undefined);
  }
}

export const imageStore: ImageStore = process.env.CLOUDINARY_URL
  ? new CloudinaryImageStore(process.env.CLOUDINARY_URL)
  : new LocalImageStore();
