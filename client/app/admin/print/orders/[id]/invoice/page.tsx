import type { Metadata } from 'next';
import OrderDocument from '../OrderDocument';

export const metadata: Metadata = { title: 'Invoice' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDocument id={id} kind="invoice" />;
}
