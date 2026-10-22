import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Ban, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Download, Eye, FileText, Pencil, Search, X } from 'lucide-react';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { useInvoiceActions } from '@/hooks/useInvoiceActions';
import { listInvoices, type InvoiceFilters } from '@/lib/api';
import { COUNTRIES, countryByCode } from '@/lib/countries';
import { INDIAN_STATES } from '@/lib/indian-states';
import { formatDbMoney } from '@/lib/money';
import { cn, formatDate } from '@/lib/utils';
import type { Invoice } from '@/types/db';
import { Button, EmptyState, ErrorBanner, Input, Select, Skeleton } from '@/components/ui/primitives';
import { Combobox } from '@/components/ui/combobox';
import { ConfirmDialog } from '@/components/ui/dialog';
import { CombinedStatus } from './StatusBadges';

export const DEFAULT_FILTERS: InvoiceFilters = {
  search: '', country: '', state: '', paymentStatus: '', invoiceStatus: 'active',
  dateFrom: '', dateTo: '', sort: 'invoice_date', dir: 'desc', page: 1, pageSize: 20,
};

const COUNTRY_FILTER_OPTIONS = [{ value: '', label: 'All countries' }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name, hint: c.code }))];

export function InvoiceTable({
  filters, onChange, showCancel = true, onDataChanged,
}: {
  filters: InvoiceFilters; onChange: (f: InvoiceFilters) => void; showCancel?: boolean; onDataChanged?: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState(filters.search ?? '');
  const debouncedSearch = useDebounced(search, 300);
  const effective = { ...filters, search: debouncedSearch };
  const key = JSON.stringify(effective);
  const { data, loading, error, reload } = useAsync(() => listInvoices(effective), [key]);
  const actions = useInvoiceActions(() => { void reload(); onDataChanged?.(); });
  const [confirm, setConfirm] = useState<{ kind: 'paid' | 'unpaid' | 'cancel'; inv: Invoice } | null>(null);

  // keep the parent's (URL) search in sync once debounced
  useEffect(() => {
    if (debouncedSearch !== (filters.search ?? '')) onChange({ ...filters, search: debouncedSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const set = (patch: Partial<InvoiceFilters>) => onChange({ ...filters, ...patch, page: patch.page ?? 1 });
  const toggleSort = (col: NonNullable<InvoiceFilters['sort']>) =>
    set({ sort: col, dir: filters.sort === col && filters.dir === 'desc' ? 'asc' : 'desc', page: filters.page });

  const pageSize = filters.pageSize ?? 20;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page ?? 1, pages);
  const hasFilters = Boolean(filters.search || filters.country || filters.state || filters.paymentStatus || filters.dateFrom || filters.dateTo || (filters.invoiceStatus && filters.invoiceStatus !== 'active'));

  return (
    <div>
      {/* ---------------- Filters */}
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(200px,1.4fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="inv-search" className="sr-only">Search by invoice number or client</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input id="inv-search" placeholder="Invoice # or client name" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-country" className="sr-only">Country</label>
          <Combobox id="f-country" value={filters.country ?? ''} options={COUNTRY_FILTER_OPTIONS} placeholder="All countries" searchPlaceholder="Search countries…"
            onChange={(v) => set({ country: v, state: v === 'IN' || v === '' ? filters.state : '' })} />
        </div>
        <div>
          <label htmlFor="f-state" className="sr-only">Indian state</label>
          <Select id="f-state" value={filters.state ?? ''} onChange={(e) => set({ state: e.target.value, country: e.target.value ? 'IN' : filters.country })}>
            <option value="">All Indian states</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="f-pay" className="sr-only">Payment status</label>
          <Select id="f-pay" value={filters.paymentStatus ?? ''} onChange={(e) => set({ paymentStatus: e.target.value as InvoiceFilters['paymentStatus'] })}>
            <option value="">Any payment status</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially paid</option>
          </Select>
        </div>
        <div>
          <label htmlFor="f-status" className="sr-only">Invoice status</label>
          <Select id="f-status" value={filters.invoiceStatus ?? 'active'} onChange={(e) => set({ invoiceStatus: e.target.value as InvoiceFilters['invoiceStatus'] })}>
            <option value="active">Issued + drafts</option>
            <option value="issued">Issued only</option>
            <option value="draft">Drafts</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All (incl. cancelled)</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          <label htmlFor="f-from" className="text-[13px] text-ink-3">From</label>
          <Input id="f-from" type="date" className="w-auto" value={filters.dateFrom ?? ''} onChange={(e) => set({ dateFrom: e.target.value })} />
          <label htmlFor="f-to" className="text-[13px] text-ink-3">to</label>
          <Input id="f-to" type="date" className="w-auto" value={filters.dateTo ?? ''} onChange={(e) => set({ dateTo: e.target.value })} />
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(''); onChange({ ...DEFAULT_FILTERS, pageSize }); }}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}

      {/* ---------------- Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[12px] font-medium text-ink-3">
              <SortTh label="Invoice #" col="invoice_number" filters={filters} onSort={toggleSort} />
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Country</th>
              <th className="px-4 py-2.5 font-medium">State</th>
              <SortTh label="Date" col="invoice_date" filters={filters} onSort={toggleSort} />
              <th className="px-4 py-2.5 text-right font-medium">Subtotal</th>
              <th className="px-4 py-2.5 text-right font-medium">Tax</th>
              <SortTh label="Grand total" col="grand_total" filters={filters} onSort={toggleSort} align="right" />
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="tabular">
            {loading && !data
              ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-line">
                  {Array.from({ length: 10 }, (__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[110px]" /></td>)}
                </tr>
              ))
              : data?.rows.map((inv) => {
                const cancelled = inv.invoice_status === 'cancelled';
                return (
                  <tr key={inv.id} className={cn('border-b border-line transition-colors hover:bg-canvas/70', cancelled && 'text-ink-3')}>
                    <td className="px-4 py-2.5">
                      <Link to={`/invoices/${inv.id}`} className={cn('font-medium text-ink hover:text-accent hover:underline', cancelled && 'line-through')}>{inv.invoice_number}</Link>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5" title={inv.client_name_snapshot}>{inv.client_name_snapshot}</td>
                    <td className="px-4 py-2.5" title={inv.client_country_snapshot}>{countryByCode(inv.country_code)?.name ?? inv.client_country_snapshot}</td>
                    <td className="px-4 py-2.5 text-ink-2">{inv.client_state_snapshot ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{formatDate(inv.invoice_date)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatDbMoney(inv.subtotal, inv.currency_code)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-ink-2">{formatDbMoney(inv.tax_amount, inv.currency_code)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium">{formatDbMoney(inv.grand_total, inv.currency_code)}</td>
                    <td className="px-4 py-2.5"><CombinedStatus invoiceStatus={inv.invoice_status} paymentStatus={inv.payment_status} /></td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-0.5">
                        <IconAction label={`View ${inv.invoice_number}`} onClick={() => navigate(`/invoices/${inv.id}`)}><Eye className="h-4 w-4" /></IconAction>
                        {!cancelled && <IconAction label={`Edit ${inv.invoice_number}`} onClick={() => navigate(`/invoices/${inv.id}/edit`)}><Pencil className="h-4 w-4" /></IconAction>}
                        <IconAction label={`Download PDF for ${inv.invoice_number}`} loading={actions.busy === `pdf:${inv.id}`} onClick={() => void actions.download(inv.id)}><Download className="h-4 w-4" /></IconAction>
                        {!cancelled && (inv.payment_status === 'paid'
                          ? <IconAction label={`Mark ${inv.invoice_number} as unpaid`} onClick={() => setConfirm({ kind: 'unpaid', inv })}><CircleDashed className="h-4 w-4" /></IconAction>
                          : <IconAction label={`Mark ${inv.invoice_number} as paid`} onClick={() => setConfirm({ kind: 'paid', inv })}><CheckCircle2 className="h-4 w-4 text-ok" /></IconAction>)}
                        {showCancel && !cancelled && (
                          <IconAction label={`Cancel ${inv.invoice_number}`} onClick={() => setConfirm({ kind: 'cancel', inv })}><Ban className="h-4 w-4 text-danger" /></IconAction>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {data && data.rows.length === 0 && !loading && (
        hasFilters ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title="No invoices match these filters" description="Try widening the date range or clearing filters." />
        ) : (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No invoices yet"
            description="Create your first invoice — numbers are generated automatically per country."
            action={<Link to="/invoices/new"><Button variant="primary">Create invoice</Button></Link>}
          />
        )
      )}

      {/* ---------------- Pagination */}
      {total > 0 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-ink-3">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            {loading && <span className="ml-2 text-ink-3">· updating…</span>}
          </span>
          <div className="flex items-center gap-2">
            <Select aria-label="Rows per page" className="w-auto" value={pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })}>
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </Select>
            <Button size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => set({ page: page - 1 })}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tabular">Page {page} of {pages}</span>
            <Button size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => set({ page: page + 1 })}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </nav>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'paid' || confirm?.kind === 'unpaid'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'paid' ? `Mark ${confirm.inv.invoice_number} as paid?` : `Mark ${confirm?.inv.invoice_number} as unpaid?`}
        description={confirm?.kind === 'paid'
          ? `Records ${formatDbMoney(confirm.inv.grand_total, confirm.inv.currency_code)} as fully paid.`
          : 'The full amount will show as outstanding again.'}
        confirmLabel={confirm?.kind === 'paid' ? 'Mark as paid' : 'Mark as unpaid'}
        onConfirm={() => confirm ? actions.setPaid(confirm.inv.id, confirm.kind === 'paid') : undefined}
      />
      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Cancel invoice ${confirm?.inv.invoice_number ?? ''}?`}
        description="It stays on record and its number is never reused, but it can't be edited and is excluded from totals. This cannot be undone."
        confirmLabel="Cancel invoice"
        tone="danger"
        withReason="Reason (optional)"
        onConfirm={(reason) => (confirm ? actions.cancel(confirm.inv.id, reason) : undefined)}
      />
    </div>
  );
}

function SortTh({ label, col, filters, onSort, align }: {
  label: string; col: NonNullable<InvoiceFilters['sort']>; filters: InvoiceFilters;
  onSort: (c: NonNullable<InvoiceFilters['sort']>) => void; align?: 'right';
}) {
  const active = filters.sort === col;
  return (
    <th className={cn('px-4 py-2.5 font-medium', align === 'right' && 'text-right')} aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(col)} className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}>
        {label}
        {active && (filters.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function IconAction({ label, onClick, children, loading }: { label: string; onClick: () => void; children: ReactNode; loading?: boolean }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} loading={loading}>
      {!loading && children}
    </Button>
  );
}
