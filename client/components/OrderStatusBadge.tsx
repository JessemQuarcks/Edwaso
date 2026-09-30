import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';

// The label always carries the status; the tint only helps scanning.
const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: '',
  paid: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  processing: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  shipped: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  delivered: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  cancelled: '',
  refunded: '',
};

const STATUS_VARIANT: Record<OrderStatus, 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  paid: 'secondary',
  processing: 'secondary',
  shipped: 'secondary',
  delivered: 'secondary',
  cancelled: 'destructive',
  refunded: 'outline',
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/** The storefront speaks to the customer: "Confirmed" rather than "Paid", and so on. */
const CUSTOMER_LABEL: Partial<Record<OrderStatus, string>> = {
  pending: 'Awaiting payment',
  paid: 'Confirmed',
  processing: 'Preparing',
};

export default function OrderStatusBadge({
  status,
  partiallyRefunded = false,
  customer = false,
  className,
}: {
  status: OrderStatus;
  /** Use customer-facing wording. */
  customer?: boolean;
  /** Adds a "part refunded" marker next to a sale that was partly refunded. */
  partiallyRefunded?: boolean;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge
        variant={STATUS_VARIANT[status]}
        className={cn(STATUS_CLASS[status], customer && status === 'pending' && 'border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300', className)}
      >
        {(customer && CUSTOMER_LABEL[status]) || STATUS_LABEL[status]}
      </Badge>
      {partiallyRefunded && (
        <Badge variant="outline" className="text-muted-foreground">
          Part refunded
        </Badge>
      )}
    </span>
  );
}
