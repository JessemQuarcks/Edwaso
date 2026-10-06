// Copies this environment's database to another one, e.g. local MongoDB → Atlas for a deploy.
// Run from server/:
//
//   $env:TARGET_MONGODB_URI="mongodb+srv://..."   # where to copy to (source is MONGODB_URI)
//   $env:CLOUDINARY_URL="cloudinary://..."        # needed if any images were uploaded locally
//   npm run copy-db -- --yes
//
// Every collection except admin sessions is copied with its _id values and indexes, and REPLACES
// the target's collection of the same name. Images uploaded to this machine's disk (links to
// <PUBLIC_API_URL>/uploads/...) are re-uploaded through the configured image store (Cloudinary)
// and the links rewritten, so the copy doesn't point at localhost.
//
// Admin 2FA secrets are encrypted with DATA_ENCRYPTION_KEY: the deployed API must use the same
// key as this environment, or enrolled authenticators stop working.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import { imageStore, sniffImage, UPLOAD_DIR, UPLOAD_PATH } from '../lib/storage.js';

const { values } = parseArgs({ options: { yes: { type: 'boolean', default: false } } });

/** Sign-ins made on this machine mean nothing elsewhere. */
const SKIP = new Set(['adminsessions']);
const BATCH = 1000;

type Doc = Record<string, unknown>;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const sourceUri = process.env.MONGODB_URI;
const targetUri = process.env.TARGET_MONGODB_URI;
if (!sourceUri) fail('MONGODB_URI (the source) is not set');
if (!targetUri) fail('Set TARGET_MONGODB_URI to the database to copy into');
if (sourceUri === targetUri) fail('TARGET_MONGODB_URI is the same database as MONGODB_URI');
if (!values.yes) fail('This replaces the target database\'s collections. Re-run with --yes to continue.');

// ---- local upload links ----

const publicOrigin = (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 5000}`).replace(/\/$/, '');
const localUploadPrefixes = [`${publicOrigin}${UPLOAD_PATH}/`];
const LOCALHOST_UPLOAD = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?${UPLOAD_PATH}/`);

/** The file name if `value` links to an image uploaded to this machine, else null. */
function localUpload(value: string): string | null {
  const prefix = localUploadPrefixes.find((p) => value.startsWith(p)) ?? value.match(LOCALHOST_UPLOAD)?.[0];
  if (!prefix) return null;
  const name = value.slice(prefix.length);
  return /^[\w-]+\.(jpg|png|webp|gif)$/.test(name) ? name : null;
}

const uploaded = new Map<string, string | null>(); // file name → new URL (null: file missing/invalid)

async function reupload(name: string): Promise<string | null> {
  if (uploaded.has(name)) return uploaded.get(name)!;
  let url: string | null = null;
  const data = await readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
  const ext = data && sniffImage(data);
  if (data && ext) {
    url = await imageStore.save(data, ext);
    console.log(`  image ${name} → ${url}`);
  } else {
    console.warn(`  image ${name}: not found in ${UPLOAD_DIR} (or not an image); link left as is`);
  }
  uploaded.set(name, url);
  return url;
}

/** Rewrites local upload links anywhere in a document. Only walks plain objects and arrays. */
async function rewrite(value: unknown): Promise<unknown> {
  if (typeof value === 'string') {
    const name = localUpload(value);
    return name ? ((await reupload(name)) ?? value) : value;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = await rewrite(value[i]);
    return value;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value; // ObjectId, Date, Binary, ...
    for (const [k, v] of Object.entries(value)) (value as Doc)[k] = await rewrite(v);
  }
  return value;
}

function hasLocalUpload(value: unknown): boolean {
  if (typeof value === 'string') return localUpload(value) !== null;
  if (Array.isArray(value)) return value.some(hasLocalUpload);
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.values(value).some(hasLocalUpload);
  }
  return false;
}

// ---- copy ----

const source = await mongoose.createConnection(sourceUri).asPromise();
const target = await mongoose.createConnection(targetUri).asPromise();

try {
  const sourceDb = source.db!;
  const targetDb = target.db!;
  console.log(`Copying ${sourceDb.databaseName} → ${targetDb.databaseName}`);

  const names = (await sourceDb.listCollections({}, { nameOnly: false }).toArray())
    .filter((c) => c.type === 'collection' && !c.name.startsWith('system.') && !SKIP.has(c.name))
    .map((c) => c.name)
    .sort();

  // Read and rewrite everything before touching the target, so a failed upload leaves it untouched.
  const data = new Map<string, Doc[]>();
  for (const name of names) {
    const docs = (await sourceDb.collection(name).find().toArray()) as Doc[];
    if (!process.env.CLOUDINARY_URL && docs.some(hasLocalUpload)) {
      fail(`${name} links to images uploaded to this machine. Set CLOUDINARY_URL so they can be re-uploaded.`);
    }
    for (const doc of docs) await rewrite(doc);
    data.set(name, docs);
  }

  const summary: [string, number][] = [];
  for (const name of names) {
    const docs = data.get(name)!;
    await targetDb.collection(name).drop().catch(() => undefined); // missing is fine
    await targetDb.createCollection(name);
    for (let i = 0; i < docs.length; i += BATCH) {
      await targetDb.collection(name).insertMany(docs.slice(i, i + BATCH), { ordered: true });
    }

    const indexes = (await sourceDb.collection(name).listIndexes().toArray())
      .filter((ix) => ix.name !== '_id_')
      .map(({ v: _v, ns: _ns, ...spec }) => spec as { key: Record<string, 1 | -1 | 'text'>; name: string });
    if (indexes.length) await targetDb.collection(name).createIndexes(indexes);

    summary.push([name, docs.length]);
  }

  console.log('\nCopied:');
  for (const [name, count] of summary) console.log(`  ${name.padEnd(20)} ${count}`);
  const missing = [...uploaded.values()].filter((url) => url === null).length;
  console.log(`\nImages re-uploaded: ${uploaded.size - missing}${missing ? `, missing: ${missing}` : ''}`);
  console.log(
    '\nSkipped: adminsessions. Make sure the deployed API uses this environment\'s DATA_ENCRYPTION_KEY,\n' +
      'or admin two-factor codes will be rejected.'
  );
} finally {
  await source.close();
  await target.close();
}
