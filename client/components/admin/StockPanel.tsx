'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { History, Loader2, Minus, Plus } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { useAdminQuery } from '@/lib/use-admin-query';
import { formatDateTime, orderNumber } from '@/lib/admin-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormError from './FormError';
import { useNotifications } from './AdminNotifications';
import { useToast } from './Toaster';
import { SELECT_CLASS } from './kit';
import { EASE_OUT } from './motion';
import type { StockHistoryResponse, StockReason } from '@/types/admin';

const REASON_LABEL: Record<StockReason, string> = {
  sale: 'Sale',
  restock: 'Restock',
  return: 'Return',
  cancellation: 'Order cancelled',
  correction: 'Count correction',
  damaged: 'Damaged / lost',
  manual: 'Edited',
  import: 'CSV import',
};

const MANUAL_REASONS: StockReason[] = ['restock', 'return', 'correction', 'damaged'];

/** Current stock, a recorded adjustment form and the history of every change. */
export default function StockPanel({ productId, stock, onStockChange }: { productId: string; stock: number; onStockChange: (stock: number) => void }) {
  const toast = useToast();
  const { refresh } = useNotifications();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<StockReason>('restock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const history = useAdminQuery<StockHistoryResponse>(`/products/${productId}/stock-history?page=${page}&limit=10`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!Number.isInteger(n) || n <= 0) return setError('Enter how many units');
    setBusy(true);
    setError('');
    try {
      const res = await adminApi<{ stock: number }>(`/products/${productId}/stock`, {
        method: 'POST',
        body: { delta: direction * n, reason, note: note || undefined },
      });
      onStockChange(res.stock);
      toast(`Stock ${direction > 0 ? 'added' : 'removed'}`, { description: `Now ${res.stock} in stock` });
      setAmount('');
      setNote('');
      setPage(1);
      history.refetch();
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardDescription>Every change is recorded with a reason.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-baseline gap-2">
          <motion.span key={stock} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold">
            {stock}
          </motion.span>
          <span className="text-sm text-muted-foreground">in stock</span>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Add or remove">
              {([1, -1] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={direction === d}
                  onClick={() => {
                    setDirection(d);
                    setReason(d > 0 ? 'restock' : 'damaged');
                  }}
                  className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-sm', direction === d ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                >
                  {d > 0 ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
                  {d > 0 ? 'Add' : 'Remove'}
                </button>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-amount" className="text-xs">
                Units
              </Label>
              <Input id="stock-amount" type="number" min="1" step="1" className="w-24" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-reason" className="text-xs">
                Reason
              </Label>
              <select id="stock-reason" className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value as StockReason)}>
                {MANUAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input placeholder="Note (optional), e.g. supplier invoice #" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <FormError message={error} />
          <Button type="submit" size="sm" className="self-start" disabled={busy || !amount}>
            {busy && <Loader2 className="animate-spin" />}
            {direction > 0 ? 'Add stock' : 'Remove stock'}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <History className="size-4" /> History
          </p>
          {history.data?.entries.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded yet.</p>}
          <ul className={cn('flex flex-col divide-y text-sm transition-opacity', history.loading && 'opacity-50')}>
            <AnimatePresence initial={false}>
              {history.data?.entries.map((e) => (
                <motion.li
                  key={e._id}
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{REASON_LABEL[e.reason]}</span>
                    {e.order && (
                      <>
                        {' '}
                        <Link href={`/admin/orders/${e.order._id}`} className="text-muted-foreground hover:underline">
                          {orderNumber(e.order._id)}
                        </Link>
                      </>
                    )}
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateTime(e.createdAt)}
                      {e.by && <> · {e.by.name}</>}
                      {e.note && <> · {e.note}</>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className={cn('font-medium', e.delta > 0 ? 'text-delta-good' : 'text-delta-bad')}>
                      {e.delta > 0 ? '+' : '−'}
                      {Math.abs(e.delta)}
                    </span>
                    <span className="block text-xs text-muted-foreground">→ {e.stockAfter}</span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {history.data && history.data.pages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Button type="button" variant="ghost" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <span>
                {page} / {history.data.pages}
              </span>
              <Button type="button" variant="ghost" size="xs" disabled={page >= history.data.pages} onClick={() => setPage((p) => p + 1)}>
                Older
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
