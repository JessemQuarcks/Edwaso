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

export default function OrderStatusBadge({
  status,
  partiallyRefunded = false,
  className,
}: {
  status: OrderStatus;
  /** Adds a "part refunded" marker next to a sale that was partly refunded. */
  partiallyRefunded?: boolean;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={STATUS_VARIANT[status]} className={cn(STATUS_CLASS[status], className)}>
        {STATUS_LABEL[status]}
      </Badge>
      {partiallyRefunded && (
        <Badge variant="outline" className="text-muted-foreground">
          Part refunded
        </Badge>
      )}
    </span>
  );
}
