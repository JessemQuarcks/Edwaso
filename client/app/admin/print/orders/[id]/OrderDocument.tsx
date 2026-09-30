import { notFound } from 'next/navigation';
import { formatPrice } from '@/lib/api';
import { adminServerGet, requireAdminMe } from '@/lib/admin-server';
import PrintButton from '@/components/admin/PrintButton';
import type { OrderDetailResponse, StoreSettings } from '@/types/admin';

const orderNumber = (id: string) => `#${id.slice(-8).toUpperCase()}`;
const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

/** Invoice and packing slip share one printable layout; the slip leaves out prices. */
export default async function OrderDocument({ id, kind }: { id: string; kind: 'invoice' | 'packing-slip' }) {
  await requireAdminMe();
  const [detail, settings] = await Promise.all([
    adminServerGet<OrderDetailResponse>(`/orders/${encodeURIComponent(id)}`),
    adminServerGet<{ settings: StoreSettings }>('/settings'),
  ]);
  if (!detail) notFound();
  const { order } = detail;
  const store = settings?.settings;
  const invoice = kind === 'invoice';
  const money = (c: number) => formatPrice(c, order.currency);
  const address = order.shippingAddress;

  return (
    <div className="min-h-svh bg-white text-neutral-900 print:bg-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-8 py-10 print:max-w-none print:p-0">
        <div className="flex justify-end print:hidden">
          <PrintButton />
        </div>

        <header className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <p className="text-xl font-semibold">{store?.storeName ?? 'Shop'}</p>
            {store?.supportEmail && <p className="text-sm text-neutral-500">{store.supportEmail}</p>}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice ? 'Invoice' : 'Packing slip'}</h1>
            <p className="text-sm text-neutral-500">Order {orderNumber(order._id)}</p>
            <p className="text-sm text-neutral-500">{invoice ? `Paid ${date(order.paidAt)}` : `Placed ${date(order.createdAt)}`}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{invoice ? 'Billed to' : 'Customer'}</p>
            <p className="font-medium">{order.user?.name ?? address?.name ?? '—'}</p>
            {order.user?.email && <p className="text-neutral-600">{order.user.email}</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">Ship to</p>
            {address?.line1 ? (
              <address className="leading-relaxed not-italic">
                {address.name && <span className="block font-medium">{address.name}</span>}
                <span className="block">{address.line1}</span>
                {address.line2 && <span className="block">{address.line2}</span>}
                <span className="block">{[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}</span>
                <span className="block">{address.country}</span>
              </address>
            ) : (
              <p className="text-neutral-500">No shipping address</p>
            )}
          </div>
        </section>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs tracking-wide text-neutral-500 uppercase">
              {!invoice && <th className="w-10 py-2 font-medium">✓</th>}
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 font-medium">SKU</th>
              <th className="py-2 text-right font-medium">Qty</th>
              {invoice && <th className="py-2 text-right font-medium">Price</th>}
              {invoice && <th className="py-2 text-right font-medium">Total</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={`${item.product}-${item.name}`} className="border-b border-neutral-100">
                {!invoice && (
                  <td className="py-3">
                    <span className="inline-block size-4 rounded-sm border border-neutral-400" />
                  </td>
                )}
                <td className="py-3">{item.name}</td>
                <td className="py-3 text-neutral-500">{item.sku ?? '—'}</td>
                <td className="py-3 text-right tabular-nums">{item.quantity}</td>
                {invoice && <td className="py-3 text-right tabular-nums">{money(item.price)}</td>}
                {invoice && <td className="py-3 text-right tabular-nums">{money(item.price * item.quantity)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        {invoice ? (
          <section className="ml-auto flex w-64 flex-col gap-1.5 text-sm">
            <Line label="Subtotal" value={money(order.payment?.amountSubtotal ?? order.total)} />
            {order.payment?.amountShipping ? <Line label="Shipping" value={money(order.payment.amountShipping)} /> : null}
            {order.payment?.amountTax ? <Line label="Tax" value={money(order.payment.amountTax)} /> : null}
            <Line label="Total" value={money(order.payment?.amountTotal ?? order.total)} strong />
            {order.amountRefunded > 0 && (
              <>
                <Line label="Refunded" value={`− ${money(order.amountRefunded)}`} />
                <Line label="Amount paid" value={money((order.payment?.amountTotal ?? order.total) - order.amountRefunded)} strong />
              </>
            )}
          </section>
        ) : (
          <p className="text-sm text-neutral-500">
            {order.items.reduce((n, i) => n + i.quantity, 0)} items
            {order.fulfillment?.carrier && ` · ${order.fulfillment.carrier}`}
            {order.fulfillment?.trackingNumber && ` · ${order.fulfillment.trackingNumber}`}
          </p>
        )}

        <footer className="border-t border-neutral-200 pt-6 text-center text-xs text-neutral-500">
          Thank you for shopping with {store?.storeName ?? 'us'}.
        </footer>
      </div>
    </div>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-2 ${strong ? 'border-t border-neutral-200 pt-1.5 font-semibold' : 'text-neutral-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}
