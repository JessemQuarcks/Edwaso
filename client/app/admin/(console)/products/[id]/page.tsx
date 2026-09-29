'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAdminQuery } from '@/lib/use-admin-query';
import { Skeleton } from '@/components/ui/skeleton';
import FormError from '@/components/admin/FormError';
import ProductEditor from '@/components/admin/ProductEditor';
import type { AdminProduct } from '@/types/admin';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useAdminQuery<{ product: AdminProduct }>(`/products/${id}`);

  if (error && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/products" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All products
        </Link>
        <FormError message={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]" aria-busy="true">
        <Skeleton className="h-[480px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }
  // Keyed so the form resets if the id changes.
  return <ProductEditor key={data.product._id} product={data.product} />;
}
