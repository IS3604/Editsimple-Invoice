import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, CircleDashed, Download, Pencil, Plus, Printer } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useInvoiceActions } from '@/hooks/useInvoiceActions';
import { getInvoice } from '@/lib/api';
import { viewFromInvoice } from '@/lib/invoice-view';
import { formatDbMoney } from '@/lib/money';
import { decimalStringToMinor, formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import { Button, Card, ErrorBanner, PageHeader, Spinner } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/dialog';
import { InvoiceDocument } from '@/components/invoice/InvoiceDocument';
import { InvoiceStatusBadge, PaymentBadge } from '@/components/invoice/StatusBadges';

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const created = params.get('created') === '1';
  const { data: inv, loading, error, reload } = useAsync(() => getInvoice(id), [id]);
  const actions = useInvoiceActions(reload);
  const [confirm, setConfirm] = useState<'cancel' | 'paid' | 'unpaid' | null>(null);

  if (loading && !inv) return <Spinner label="Loading invoice" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!inv) return null;

  const cancelled = inv.invoice_status === 'cancelled';
  const isPaid = inv.payment_status === 'paid';
  const outstanding = decimalStringToMinor(inv.grand_total) - decimalStringToMinor(inv.paid_amount);

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoice_number}`}
        description={<span className="flex flex-wrap items-center gap-2">{inv.client_name_snapshot} · {formatDate(inv.invoice_date)} <InvoiceStatusBadge status={inv.invoice_status} />{!cancelled && <PaymentBadge status={inv.payment_status} />}</span>}
        actions={
          <>
            <Button onClick={() => void actions.print(inv.id)} loading={actions.busy === `print:${inv.id}`}><Printer className="h-4 w-4" /> Print</Button>
            <Button variant="primary" onClick={() => void actions.download(inv.id)} loading={actions.busy === `pdf:${inv.id}`}><Download className="h-4 w-4" /> Download PDF</Button>
          </>
        }
      />

      {created && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ok/25 bg-ok-soft px-4 py-3 text-sm text-ok">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Saved. Invoice number <strong>{inv.invoice_number}</strong> is now permanent.</span>
          <div className="flex gap-2">
            <Link to="/invoices/new"><Button size="sm"><Plus className="h-4 w-4" /> Create another invoice</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => setParams({}, { replace: true })}>Dismiss</Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <InvoiceDocument view={viewFromInvoice(inv)} />

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="tabular mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Grand total</dt><dd className="font-medium">{formatDbMoney(inv.grand_total, inv.currency_code)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Paid</dt><dd>{formatDbMoney(inv.paid_amount, inv.currency_code)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Outstanding</dt><dd className="font-medium">{cancelled ? '—' : formatMoney(outstanding > 0n ? outstanding : 0n, inv.currency_code)}</dd></div>
              {inv.issued_at && <div className="flex justify-between"><dt className="text-ink-3">Issued</dt><dd>{formatDate(inv.issued_at)}</dd></div>}
              {inv.cancelled_at && <div className="flex justify-between"><dt className="text-ink-3">Cancelled</dt><dd>{formatDate(inv.cancelled_at)}</dd></div>}
            </dl>
          </Card>

          {!cancelled && (
            <Card className="space-y-2 p-5">
              <h2 className="mb-1 text-sm font-semibold">Actions</h2>
              <Link to={`/invoices/${inv.id}/edit`} className="block"><Button className="w-full"><Pencil className="h-4 w-4" /> Edit invoice</Button></Link>
              {isPaid ? (
                <Button className="w-full" onClick={() => setConfirm('unpaid')} loading={actions.busy === `paid:${inv.id}`}><CircleDashed className="h-4 w-4" /> Mark as unpaid</Button>
              ) : (
                <Button className="w-full" onClick={() => setConfirm('paid')} loading={actions.busy === `paid:${inv.id}`}><CheckCircle2 className="h-4 w-4" /> Mark as paid</Button>
              )}
              <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirm('cancel')}><Ban className="h-4 w-4" /> Cancel invoice</Button>
            </Card>
          )}
          {inv.client_id && (
            <Link to={`/clients/${inv.client_id}`} className="block text-center text-sm font-medium text-accent hover:underline">View client record</Link>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'paid' || confirm === 'unpaid'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'paid' ? 'Mark invoice as paid?' : 'Mark invoice as unpaid?'}
        description={confirm === 'paid'
          ? `${inv.invoice_number} will be recorded as fully paid (${formatDbMoney(inv.grand_total, inv.currency_code)}).`
          : `${inv.invoice_number} will show the full amount as outstanding again.`}
        confirmLabel={confirm === 'paid' ? 'Mark as paid' : 'Mark as unpaid'}
        onConfirm={() => actions.setPaid(inv.id, confirm === 'paid')}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Cancel invoice ${inv.invoice_number}?`}
        description="The invoice is kept for your records and its number is never reused, but it can no longer be edited or counted in totals. This cannot be undone."
        confirmLabel="Cancel invoice"
        tone="danger"
        withReason="Reason (optional)"
        onConfirm={(reason) => actions.cancel(inv.id, reason)}
      />
    </>
  );
}
