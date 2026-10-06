import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudinaryImageStore } from '../src/lib/storage.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const store = () => new CloudinaryImageStore('cloudinary://key123:secret456@demo-cloud');

function stubFetch(response: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(response), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sign = (params: string) => createHash('sha1').update(params + 'secret456').digest('hex');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloudinaryImageStore', () => {
  it('rejects a malformed CLOUDINARY_URL', () => {
    expect(() => new CloudinaryImageStore('https://example.com')).toThrow(/CLOUDINARY_URL/);
  });

  it('uploads with a signed request and returns the https URL', async () => {
    const url = 'https://res.cloudinary.com/demo-cloud/image/upload/v1/uploads/abc.png';
    const fetchMock = stubFetch({ secure_url: url });

    await expect(store().save(PNG, 'png')).resolves.toBe(url);

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
    const body = init.body as FormData;
    const timestamp = body.get('timestamp') as string;
    expect(body.get('api_key')).toBe('key123');
    expect(body.get('folder')).toBe('uploads');
    expect(body.get('signature')).toBe(sign(`folder=uploads&timestamp=${timestamp}`));
    expect(body.get('file')).toBeInstanceOf(Blob);
  });

  it('surfaces Cloudinary errors', async () => {
    stubFetch({ error: { message: 'Invalid Signature' } }, 401);
    await expect(store().save(PNG, 'png')).rejects.toThrow('Cloudinary upload failed: Invalid Signature');
  });

  it('deletes its own images by public id', async () => {
    const fetchMock = stubFetch({ result: 'ok' });
    await store().remove('https://res.cloudinary.com/demo-cloud/image/upload/v17/uploads/abc.png');

    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/destroy');
    const body = init.body as FormData;
    expect(body.get('public_id')).toBe('uploads/abc');
    expect(body.get('signature')).toBe(sign(`public_id=uploads/abc&timestamp=${body.get('timestamp')}`));
  });

  it('ignores URLs it did not create', async () => {
    const fetchMock = stubFetch({});
    await store().remove('https://res.cloudinary.com/other-cloud/image/upload/v1/uploads/abc.png');
    await store().remove('https://picsum.photos/400');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
