import { Badge } from '@/components/ui/primitives';
import type { InvoiceStatus, PaymentStatus } from '@/types/db';

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === 'paid') return <Badge tone="ok">Paid</Badge>;
  if (status === 'partial') return <Badge tone="warn">Partially paid</Badge>;
  return <Badge tone="warn">Unpaid</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus | 'unsaved' }) {
  if (status === 'draft') return <Badge tone="neutral">Draft</Badge>;
  if (status === 'cancelled') return <Badge tone="danger">Cancelled</Badge>;
  if (status === 'unsaved') return <Badge tone="neutral">Not saved</Badge>;
  return <Badge tone="accent">Issued</Badge>;
}

/** Combined status for tables: cancelled/draft win over payment state. */
export function CombinedStatus({ invoiceStatus, paymentStatus }: { invoiceStatus: InvoiceStatus; paymentStatus: PaymentStatus }) {
  if (invoiceStatus !== 'issued') return <InvoiceStatusBadge status={invoiceStatus} />;
  return <PaymentBadge status={paymentStatus} />;
}
