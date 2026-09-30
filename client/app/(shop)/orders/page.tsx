import { redirect } from 'next/navigation';

// Order history moved into the account area.
export default function OrdersRedirect() {
  redirect('/account/orders');
}
