'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import FormError from '@/components/admin/FormError';
import ImageGallery from '@/components/admin/ImageGallery';
import { useToast } from '@/components/admin/Toaster';
import { EmptyState, SELECT_CLASS, Thumb } from '@/components/admin/kit';
import { Stagger, StaggerItem } from '@/components/admin/motion';
import type { Category } from '@/types/admin';

interface Form {
  name: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: string;
}

const toForm = (c?: Category): Form => ({
  name: c?.name ?? '',
  slug: c?.slug ?? '',
  description: c?.description ?? '',
  image: c?.image ?? '',
  sortOrder: String(c?.sortOrder ?? 0),
});

export default function CategoriesPage() {
  const toast = useToast();
  const { data, error, refetch, loading } = useAdminQuery<{ categories: Category[] }>('/categories');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const categories = data?.categories ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Categories group products on the store. Lower sort numbers come first.
        </p>
        <Button onClick={() => setEditing('new')}>
          <Plus /> New category
        </Button>
      </div>
      <FormError message={error} />

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState icon={Tags} title="No categories yet" description="Create one, or add a category while editing a product." />
        </Card>
      ) : (
        <Stagger className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3 transition-opacity', loading && 'opacity-60')}>
          {categories.map((c) => (
            <StaggerItem key={c._id}>
              <Card className="group h-full flex-row items-center gap-4 p-4 transition-shadow hover:shadow-md">
                <Thumb src={c.image} alt={c.name} className="size-14 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    /{c.slug} · order {c.sortOrder}
                  </p>
                  <Link href={`/admin/products?category=${c.slug}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                    {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                  </Link>
                </div>
                <div className="flex flex-col gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`}>
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <CategoryDialog
        category={editing === 'new' ? undefined : (editing ?? undefined)}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={(name, created) => {
          toast(created ? 'Category created' : 'Category saved', { description: name });
          setEditing(null);
          refetch();
        }}
      />
      <DeleteDialog
        category={deleting}
        others={categories.filter((c) => c._id !== deleting?._id)}
        onClose={() => setDeleting(null)}
        onDeleted={(name) => {
          toast('Category deleted', { description: name });
          setDeleting(null);
          refetch();
        }}
      />
    </div>
  );
}

function CategoryDialog({
  category,
  open,
  onClose,
  onSaved,
}: {
  category?: Category;
  open: boolean;
  onClose: () => void;
  onSaved: (name: string, created: boolean) => void;
}) {
  const [form, setForm] = useState<Form>(toForm(category));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastId, setLastId] = useState<string | undefined>(undefined);

  // Reset the form whenever a different category (or "new") opens.
  const id = open ? (category?._id ?? 'new') : undefined;
  if (id !== lastId) {
    setLastId(id);
    setForm(toForm(category));
    setError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: form.name,
      ...(form.slug ? { slug: form.slug } : {}),
      description: form.description,
      image: form.image,
      sortOrder: parseInt(form.sortOrder || '0', 10),
    };
    try {
      if (category) await adminApi(`/categories/${category._id}`, { method: 'PUT', body });
      else await adminApi('/categories', { method: 'POST', body });
      onSaved(form.name, !category);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          {category && category.productCount > 0 && (
            <DialogDescription>Changing the slug moves its {category.productCount} products with it.</DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-2">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" required maxLength={60} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="c-order">Sort order</Label>
              <Input id="c-order" type="number" step="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-slug">URL slug</Label>
            <Input id="c-slug" maxLength={60} placeholder="made from the name if empty" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-desc">Description</Label>
            <Textarea id="c-desc" rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Image</span>
            <ImageGallery images={form.image ? [form.image] : []} onChange={(imgs) => setForm({ ...form, image: imgs.at(-1) ?? '' })} />
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {category ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  category,
  others,
  onClose,
  onDeleted,
}: {
  category: Category | null;
  others: Category[];
  onClose: () => void;
  onDeleted: (name: string) => void;
}) {
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsMove = (category?.productCount ?? 0) > 0;

  async function remove() {
    if (!category) return;
    setBusy(true);
    setError('');
    try {
      await adminApi(`/categories/${category._id}${needsMove ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`, { method: 'DELETE' });
      onDeleted(category.name);
      setMoveTo('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{category?.name}”?</DialogTitle>
          <DialogDescription>
            {needsMove ? `Its ${category?.productCount} products need a new category first.` : 'No products use it.'}
          </DialogDescription>
        </DialogHeader>
        {needsMove && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="grid gap-2">
            <Label htmlFor="move-to">Move products to</Label>
            <select id="move-to" className={cn(SELECT_CLASS, 'w-full')} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Choose a category…</option>
              {others.map((c) => (
                <option key={c._id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </motion.div>
        )}
        <FormError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => void remove()} disabled={busy || (needsMove && !moveTo)}>
            {busy && <Loader2 className="animate-spin" />}
            Delete category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
