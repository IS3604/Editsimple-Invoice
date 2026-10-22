import { formatMoney, formatQuantity } from '@/lib/money';
import type { InvoiceView } from '@/lib/invoice-view';
import { cn, formatDate } from '@/lib/utils';

const m = (v: bigint | null, c: string) => (v === null ? '—' : formatMoney(v, c));

/** On-screen invoice (live preview + detail page). Mirrors the PDF layout. */
export function InvoiceDocument({ view, className }: { view: InvoiceView; className?: string }) {
  const c = view.currency;
  const statusLabel = view.invoiceStatus === 'cancelled' ? 'CANCELLED' : view.paymentStatus === 'paid' ? 'PAID' : view.paymentStatus === 'partial' ? 'PARTIALLY PAID' : 'UNPAID';
  return (
    <article className={cn('relative overflow-hidden rounded-lg border border-line bg-white p-6 text-[12.5px] leading-relaxed text-ink sm:p-8', className)} aria-label="Invoice preview">
      {view.invoiceStatus === 'draft' && (
        <div className="pointer-events-none absolute right-6 top-6 rotate-6 rounded border-2 border-ink-3/40 px-2 py-0.5 text-xs font-bold tracking-widest text-ink-3/60">DRAFT</div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-5">
        <div className="max-w-[60%]">
          <div className="text-[15px] font-semibold">{view.company.company_name}</div>
          <div className="mt-1 whitespace-pre-line text-ink-2">{view.company.company_address}</div>
          <div className="text-ink-2">{view.company.company_email}</div>
          {view.isIndia && view.company.gstin && <div className="text-ink-2">GSTIN: {view.company.gstin}</div>}
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tracking-tight">{view.isIndia ? 'TAX INVOICE' : 'INVOICE'}</div>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-ink-2">
            <dt>Invoice No.</dt><dd className="font-medium text-ink">{view.number ?? '—'}</dd>
            <dt>Date</dt><dd className="font-medium text-ink">{formatDate(view.date)}</dd>
          </dl>
        </div>
      </header>

      <section className="grid gap-6 py-5 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Bill to</div>
          <div className="font-medium">{view.client.name || <span className="text-ink-3">Client name</span>}</div>
          {view.client.address && <div className="whitespace-pre-line text-ink-2">{view.client.address}</div>}
          <div className="text-ink-2">{[view.client.state, view.client.country].filter(Boolean).join(', ') || <span className="text-ink-3">Country</span>}</div>
          {view.client.phone && <div className="text-ink-2">{view.client.phone}</div>}
        </div>
        <div className="sm:text-right">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Status</div>
          <div className={cn('font-semibold', view.invoiceStatus === 'cancelled' ? 'text-danger' : view.paymentStatus === 'paid' ? 'text-ok' : 'text-warn')}>{statusLabel}</div>
          {view.cancelReason && <div className="text-ink-3">{view.cancelReason}</div>}
        </div>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse">
          <thead>
            <tr className="border-y border-line bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-3">
              <th className="w-8 px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Description</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">Unit price</th>
              <th className="px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {view.items.map((it, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="px-2 py-2 text-ink-3">{i + 1}</td>
                <td className="whitespace-pre-line break-words px-2 py-2">{it.description || <span className="text-ink-3">—</span>}</td>
                <td className="px-2 py-2 text-right">{it.quantity ? formatQuantity(it.quantity) : '—'}</td>
                <td className="px-2 py-2 text-right">{m(it.unitPrice, c)}</td>
                <td className="px-2 py-2 text-right font-medium">{m(it.lineTotal, c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex justify-end">
        <dl className="tabular w-full max-w-[300px] space-y-1">
          <Row label={view.isIndia ? 'Subtotal (Inclusive of Tax)' : 'Subtotal'} value={m(view.subtotal, c)} />
          {view.isIndia && <Row label="Taxable Value" value={m(view.taxableValue, c)} muted />}
          {view.isIndia && !view.split && <Row label={`Tax (${view.taxRateLabel} Inclusive)`} value={m(view.taxAmount, c)} muted />}
          {view.isIndia && view.split?.type === 'igst' && <Row label={`IGST (${view.split.rate} Inclusive)`} value={m(view.split.igst, c)} muted />}
          {view.isIndia && view.split?.type === 'cgst_sgst' && (
            <>
              <Row label={`CGST (${view.split.rate} Inclusive)`} value={m(view.split.cgst, c)} muted />
              <Row label={`SGST (${view.split.rate} Inclusive)`} value={m(view.split.sgst, c)} muted />
            </>
          )}
          {!view.isIndia && <Row label="Tax" value={m(0n, c)} muted />}
          <div className="!mt-2 flex items-baseline justify-between border-t border-ink/80 pt-2 text-[14px] font-semibold">
            <dt>Grand Total</dt><dd>{m(view.grandTotal, c)}</dd>
          </div>
          {view.paymentStatus !== 'unpaid' && view.invoiceStatus !== 'cancelled' && (
            <Row label="Balance due" value={m(view.grandTotal - view.paidAmount, c)} muted />
          )}
        </dl>
      </section>

      <section className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Payment info</div>
          {view.paymentLines.length === 0 ? (
            <p className="text-ink-3">Payment details not configured.</p>
          ) : (
            <dl className="space-y-0.5">
              {view.paymentLines.map((l, i) => (
                <div key={i} className={cn(!l.label && 'font-medium')}>
                  {l.label && <dt className="inline text-ink-3">{l.label}: </dt>}
                  <dd className="inline whitespace-pre-line">{l.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div>
          {view.company.payment_terms && (
            <>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Terms</div>
              <p className="whitespace-pre-line text-ink-2">{view.company.payment_terms}</p>
            </>
          )}
          {view.notes && (
            <>
              <div className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Notes</div>
              <p className="whitespace-pre-line text-ink-2">{view.notes}</p>
            </>
          )}
        </div>
      </section>
      {view.company.pdf_footer_text && (
        <footer className="mt-6 border-t border-line pt-4 text-center text-ink-3">{view.company.pdf_footer_text}</footer>
      )}
    </article>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', muted && 'text-ink-2')}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}
