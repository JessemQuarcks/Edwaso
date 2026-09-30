'use client';

import { useState, type FormEvent } from 'react';
import { CircleDollarSign, Loader2, PackageCheck, PackageOpen, RotateCcw, Truck, XCircle } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { adminApi } from '@/lib/admin-api';
import { formatPrice, orderNumber } from '@/lib/admin-format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FormError from './FormError';
import { useAdmin } from './AdminShell';
import { useNotifications } from './AdminNotifications';
import { useToast } from './Toaster';
import { SELECT_CLASS } from './kit';
import type { OrderDetailResponse } from '@/types/admin';
import type { OrderStatus } from '@/types';

const CARRIERS = ['DHL', 'UPS', 'FedEx', 'USPS', 'Royal Mail', 'Canada Post', 'Other'];

const HINT: Partial<Record<OrderStatus, string>> = {
  pending: 'Waiting for the customer to finish paying.',
  paid: 'Paid and ready to prepare.',
  processing: 'Being prepared for shipping.',
  shipped: 'On its way to the customer.',
};

type DialogKind = 'ship' | 'cancel' | 'refund' | null;

/** The fulfilment and money actions allowed for the order's current status. */
export default function OrderActions({ data, onChange }: { data: OrderDetailResponse; onChange: (d: OrderDetailResponse) => void }) {
  const { order, allowedTransitions: allowed, refundable } = data;
  const admin = useAdmin();
  const toast = useToast();
  const { refresh } = useNotifications();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const canRefund = (admin.role === 'owner' || admin.role === 'admin') && refundable > 0;

  if (allowed.length === 0 && !canRefund) return null;

  async function patchStatus(status: OrderStatus, body: Record<string, unknown> = {}, message = 'Order updated') {
    setError('');
    setBusy(status);
    try {
      const result = await adminApi<OrderDetailResponse>(`/orders/${order._id}/status`, { method: 'PATCH', body: { status, ...body } });
      onChange(result);
      refresh();
      setDialog(null);
      toast(message, { description: orderNumber(order._id) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{HINT[order.status] ?? 'This order is complete.'}</p>
        <div className="flex flex-wrap gap-2">
          {canRefund && (
            <Button variant="outline" onClick={() => setDialog('refund')}>
              <RotateCcw /> Refund
            </Button>
          )}
          {allowed.includes('cancelled') && (
            <Button variant="outline" onClick={() => setDialog('cancel')}>
              <XCircle /> Cancel order
            </Button>
          )}
          {allowed.includes('processing') && (
            <Button variant="outline" onClick={() => void patchStatus('processing', {}, 'Marked as processing')} disabled={busy !== null}>
              {busy === 'processing' ? <Loader2 className="animate-spin" /> : <PackageOpen />}
              Start processing
            </Button>
          )}
          {allowed.includes('shipped') && (
            <Button onClick={() => setDialog('ship')}>
              <Truck /> Mark as shipped
            </Button>
          )}
          {allowed.includes('delivered') && (
            <Button onClick={() => void patchStatus('delivered', {}, 'Marked as delivered')} disabled={busy !== null}>
              {busy === 'delivered' ? <Loader2 className="animate-spin" /> : <PackageCheck />}
              Mark as delivered
            </Button>
          )}
        </div>
      </div>
      {dialog === null && <FormError message={error} />}

      <ShipDialog
        open={dialog === 'ship'}
        onClose={() => setDialog(null)}
        busy={busy === 'shipped'}
        error={error}
        onSubmit={(body) => void patchStatus('shipped', body, body.notify ? 'Shipped, customer emailed' : 'Marked as shipped')}
      />
      <CancelDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        paid={['paid', 'processing'].includes(order.status)}
        stockTaken={['paid', 'processing'].includes(order.status)}
        canRefund={canRefund}
        refundable={refundable}
        busy={busy === 'cancelled'}
        error={error}
        onSubmit={(body) => void patchStatus('cancelled', body, body.refund ? 'Order cancelled and refunded' : 'Order cancelled')}
      />
      <RefundDialog
        open={dialog === 'refund'}
        onClose={() => setDialog(null)}
        data={data}
        onDone={(result, amount) => {
          onChange(result);
          refresh();
          setDialog(null);
          toast(`Refunded ${formatPrice(amount)}`, { description: orderNumber(order._id) });
        }}
      />
    </Card>
  );
}

function ShipDialog({
  open,
  onClose,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string;
  onSubmit: (body: { carrier?: string; trackingNumber?: string; trackingUrl?: string; notify: boolean }) => void;
}) {
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [notify, setNotify] = useState(true);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ carrier: carrier || undefined, trackingNumber: trackingNumber || undefined, trackingUrl: trackingUrl || undefined, notify });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as shipped</DialogTitle>
          <DialogDescription>Tracking details are optional but help the customer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="carrier">Carrier</Label>
              <select id="carrier" className={SELECT_CLASS} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="">Choose…</option>
                {CARRIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input id="tracking" maxLength={100} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tracking-url">Tracking link</Label>
            <Input id="tracking-url" type="url" placeholder="https://…" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email the customer that it’s on the way
          </label>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Truck />}
              Mark as shipped
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  paid,
  stockTaken,
  canRefund,
  refundable,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  paid: boolean;
  stockTaken: boolean;
  canRefund: boolean;
  refundable: number;
  busy: boolean;
  error: string;
  onSubmit: (body: { note?: string; refund: boolean; restock: boolean }) => void;
}) {
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState(true);
  const [restock, setRestock] = useState(true);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>The customer’s order history will show it as cancelled.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {paid && canRefund && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
              <span>
                Refund {formatPrice(refundable)} to the customer through Stripe
                <span className="block text-xs text-muted-foreground">Leave unticked only if you’ve refunded them another way.</span>
              </span>
            </label>
          )}
          {paid && !canRefund && (
            <Alert>
              <CircleDollarSign />
              <AlertDescription>
                This order was paid, and cancelling won’t refund it.{' '}
                {refundable > 0 ? 'An owner or admin can refund it from this page.' : 'Refund it in your Stripe dashboard.'}
              </AlertDescription>
            </Alert>
          )}
          {stockTaken && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              Put the items back in stock
            </label>
          )}
          <div className="grid gap-2">
            <Label htmlFor="cancel-note">Reason (optional, visible to staff)</Label>
            <Textarea id="cancel-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => onSubmit({ note: note || undefined, refund: paid && canRefund && refund, restock: stockTaken && restock })}
          >
            {busy && <Loader2 className="animate-spin" />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REASONS = [
  { id: 'requested_by_customer', label: 'Customer request' },
  { id: 'duplicate', label: 'Duplicate charge' },
  { id: 'fraudulent', label: 'Fraudulent' },
  { id: 'other', label: 'Other' },
];

function RefundDialog({
  open,
  onClose,
  data,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  data: OrderDetailResponse;
  onDone: (result: OrderDetailResponse, amount: number) => void;
}) {
  const max = data.refundable;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('requested_by_customer');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cents = Math.round(parseFloat(amount || '0') * 100);
  const full = cents === max;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await adminApi<OrderDetailResponse>(`/orders/${data.order._id}/refunds`, {
        method: 'POST',
        body: { amount: cents, reason, note: note || undefined, restock: full && restock },
      });
      onDone(result, cents);
      setAmount('');
      setNote('');
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
          <DialogTitle>Refund through Stripe</DialogTitle>
          <DialogDescription>
            Up to {formatPrice(max)} can be refunded
            {data.order.amountRefunded > 0 && ` (${formatPrice(data.order.amountRefunded)} already refunded)`}. It usually reaches the customer
            in 5–10 days.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="refund-amount">Amount</Label>
            <div className="flex gap-2">
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={(max / 100).toFixed(2)}
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => setAmount((max / 100).toFixed(2))}>
                Full amount
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <select id="refund-reason" className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="refund-note">Note (optional, visible to staff)</Label>
            <Input id="refund-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {full && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              The items came back: put them in stock
            </label>
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || cents < 1 || cents > max}>
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Refund {cents > 0 ? formatPrice(cents) : ''}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
