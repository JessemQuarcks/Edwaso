import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { isOptimizable } from '@/lib/image-hosts';
import { cn } from '@/lib/utils';

/**
 * A product/category picture that fills its (relatively positioned) parent. Uses next/image for
 * known hosts (resized, modern formats, lazy) and a plain <img> for anything else, so an image
 * URL pasted in the admin never breaks the page. Without a src it draws a neutral placeholder.
 */
export default function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: {
  src?: string | null;
  alt: string;
  /** Rendered width hint for responsive loading, e.g. "(min-width: 1024px) 25vw, 50vw". */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const classes = cn('absolute inset-0 size-full object-cover', className);
  if (!src) {
    return (
      <div className={cn('absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground', className)} aria-hidden>
        <ImageIcon className="size-8 opacity-40" />
      </div>
    );
  }
  if (isOptimizable(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={classes} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" className={classes} />;
}
