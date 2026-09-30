'use client';

import { useState, type DragEvent } from 'react';
import { AnimatePresence, Reorder } from 'motion/react';
import { ChevronLeft, ChevronRight, ImagePlus, Link2, Loader2, Star, X } from 'lucide-react';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormError from './FormError';

export const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/admin/uploads/images', { method: 'POST', body, credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !data.url) throw new ApiError(res.status, data.message ?? `Upload failed (${res.status})`);
  return data.url;
}

/**
 * Ordered product images: upload or paste a URL, drag (or use the arrows) to reorder. The first is the main image.
 * With `max={1}` it is a single-image picker: no ordering, and removing the image makes room for another.
 */
export default function ImageGallery({ images, onChange, max = MAX_IMAGES }: { images: string[]; onChange: (images: string[]) => void; max?: number }) {
  const single = max === 1;
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const room = max - images.length;

  async function addFiles(files: File[]) {
    setError('');
    const batch = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (files.length > room) setError(single ? 'Only one image here; extra files were skipped.' : `Only ${max} images per product; extra files were skipped.`);
    setUploading(batch.length);
    let next = images;
    for (const file of batch) {
      try {
        next = [...next, await uploadImage(file)];
        onChange(next);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function addUrl() {
    const value = url.trim();
    if (!/^https?:\/\/\S+$/i.test(value)) return setError('Enter a full http(s) image URL');
    if (images.includes(value)) return setError('That image is already in the gallery');
    onChange([...images, value]);
    setUrl('');
    setError('');
  }

  const move = (index: number, delta: -1 | 1) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void addFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <Reorder.Group axis="x" values={images} onReorder={onChange} className="flex flex-wrap gap-3">
          <AnimatePresence initial={false}>
            {images.map((src, i) => (
              <Reorder.Item
                key={src}
                value={src}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileDrag={{ scale: 1.05, zIndex: 10 }}
                className={cn('group relative size-24 cursor-grab overflow-hidden rounded-xl border bg-muted active:cursor-grabbing', i === 0 && !single && 'ring-2 ring-primary')}
              >
                <img src={src} alt={`Image ${i + 1}`} className="size-full object-cover" draggable={false} />
                {i === 0 && !single && (
                  <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-md bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    <Star className="size-2.5 fill-current" /> Main
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onChange(images.filter((x) => x !== src))}
                  className="absolute top-1 right-1 rounded-md bg-background/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Remove image ${i + 1}`}
                >
                  <X className="size-3.5" />
                </button>
                <div hidden={single} className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="rounded-md bg-background/90 p-0.5 shadow-sm disabled:invisible"
                    aria-label={`Move image ${i + 1} earlier`}
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === images.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded-md bg-background/90 p-0.5 shadow-sm disabled:invisible"
                    aria-label={`Move image ${i + 1} later`}
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      {room > 0 && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-5 text-center text-sm transition-colors hover:bg-muted/50',
            dragOver && 'border-primary bg-muted'
          )}
        >
          {uploading > 0 ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : <ImagePlus className="size-6 text-muted-foreground" />}
          <span className="font-medium">{uploading > 0 ? `Uploading ${uploading}…` : single ? 'Drop an image here or click to upload' : 'Drop images here or click to upload'}</span>
          <span className="text-xs text-muted-foreground">{single ? 'JPEG, PNG, WebP or GIF, up to 5 MB' : `JPEG, PNG, WebP or GIF, up to 5 MB each · ${room} more allowed`}</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple={!single}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void addFiles([...e.target.files]);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {room > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="url"
              placeholder="…or paste an image URL"
              aria-label="Image URL"
              className="pl-8"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addUrl();
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={addUrl} disabled={!url.trim()}>
            Add
          </Button>
        </div>
      )}
      <FormError message={error} />
    </div>
  );
}
