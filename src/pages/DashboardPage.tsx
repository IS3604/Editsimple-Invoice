import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, FilePlus2, Files, Hourglass, Wallet } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { dashboardSummary, type InvoiceFilters } from '@/lib/api';
import { formatDbMoney } from '@/lib/money';
import { Button, Card, CardHeader, ErrorBanner, PageHeader, Skeleton } from '@/components/ui/primitives';
import { DEFAULT_FILTERS, InvoiceTable } from '@/components/invoice/InvoiceTable';
import type { DashboardSummary } from '@/types/db';

export function DashboardPage() {
  const summary = useAsync(() => dashboardSummary(), []);
  const [filters, setFilters] = useState<InvoiceFilters>({ ...DEFAULT_FILTERS, pageSize: 10 });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Issued invoices only. Drafts and cancelled invoices are excluded from totals."
        actions={<Link to="/invoices/new"><Button variant="primary"><FilePlus2 className="h-4 w-4" /> Create Invoice</Button></Link>}
      />
      {summary.error && <div className="mb-4"><ErrorBanner message={summary.error} onRetry={summary.reload} /></div>}
      <SummaryCards data={summary.data} loading={summary.loading && !summary.data} />

      <Card className="mt-6">
        <CardHeader title="Recent invoices" actions={<Link to="/invoices" className="text-sm font-medium text-accent hover:underline">View all</Link>} />
        <InvoiceTable filters={filters} onChange={setFilters} showCancel={false} onDataChanged={() => void summary.reload()} />
      </Card>
    </>
  );
}

function SummaryCards({ data, loading }: { data: DashboardSummary | null; loading: boolean }) {
  const groups = data?.by_currency ?? [];
  const perCurrency = (key: 'total_value' | 'total_paid' | 'total_outstanding') =>
    groups.length ? groups.map((g) => ({ code: g.currency_code, value: formatDbMoney(g[key], g.currency_code) })) : [{ code: '-', value: '—' }];

  const cards = [
    { label: 'Total Invoices', icon: Files, lines: [{ code: '', value: String(data?.invoice_count ?? 0) }], foot: data ? `${data.draft_count} draft · ${data.cancelled_count} cancelled` : '' },
    { label: 'Total Invoice Value', icon: CircleDollarSign, lines: perCurrency('total_value') },
    { label: 'Total Paid', icon: Wallet, lines: perCurrency('total_paid') },
    { label: 'Total Outstanding', icon: Hourglass, lines: perCurrency('total_outstanding') },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, icon: Icon, lines, foot }) => (
        <Card key={label} className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-3">{label}</span>
            <Icon className="h-4 w-4 text-ink-3" aria-hidden />
          </div>
          <div className="mt-3 space-y-1">
            {loading ? <Skeleton className="h-7 w-32" /> : lines.map((l) => (
              <div key={l.code} className="tabular text-[20px] font-semibold leading-tight tracking-tight text-ink">
                {l.value}
              </div>
            ))}
          </div>
          {foot && <p className="mt-2 text-[12px] text-ink-3">{foot}</p>}
          {!foot && lines.length > 1 && <p className="mt-2 text-[12px] text-ink-3">Shown per currency</p>}
        </Card>
      ))}
    </div>
  );
}
