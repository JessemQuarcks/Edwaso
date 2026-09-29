import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types';

// Tinted variants for the two states shadcn has no semantic variant for.
const STATUS_CLASS: Record<OrderStatus, string> = {
  pending: '',
  paid: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  shipped: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  cancelled: '',
};

const STATUS_VARIANT: Record<OrderStatus, 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  paid: 'secondary',
  shipped: 'secondary',
  cancelled: 'destructive',
};

export default function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn('capitalize', STATUS_CLASS[status], className)}>
      {status}
    </Badge>
  );
}
