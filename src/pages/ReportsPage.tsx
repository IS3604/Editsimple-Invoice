import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { fetchReportRows } from '@/lib/api';
import { byCountry, byMonth, countByMonth, currenciesIn, monthRange, toChart, totals } from '@/lib/reports';
import { formatMoney } from '@/lib/money';
import { todayISO } from '@/lib/invoice-form';
import { Card, CardHeader, EmptyState, ErrorBanner, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const ACCENT = '#0f6e6a';
const PAID = '#067647';
const OUTSTANDING = '#d39b2a';
const GRID = '#e3e6eb';
const AXIS = '#6b7587';

function defaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11, 1);
  return todayISO(d);
}

export function ReportsPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayISO);
  const { data: rows, loading, error, reload } = useAsync(() => fetchReportRows(from, to), [from, to]);
  const currencies = useMemo(() => currenciesIn(rows ?? []), [rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked && currencies.includes(picked) ? picked : currencies[0] ?? 'INR';
  const months = useMemo(() => (from && to && from <= to ? monthRange(from, to) : []), [from, to]);

  const monthly = useMemo(() => byMonth(rows ?? [], currency, months).map((b) => ({
    label: b.label, Total: toChart(b.total), Paid: toChart(b.paid), Outstanding: toChart(b.total - b.paid), Tax: toChart(b.tax),
  })), [rows, currency, months]);
  const counts = useMemo(() => countByMonth(rows ?? [], months), [rows, months]);
  const countries = useMemo(() => byCountry(rows ?? [], currency).slice(0, 10).map((c) => ({ name: c.country, Total: toChart(c.total), count: c.count })), [rows, currency]);
  const t = useMemo(() => totals(rows ?? [], currency), [rows, currency]);
  const inr = useMemo(() => totals(rows ?? [], 'INR'), [rows]);
  const fmtAxis = (v: number) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const fmtTip = (v: unknown) => formatMoney(BigInt(Math.round(Number(v) * 100)), currency);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Built from issued invoices in the selected period. Amounts are shown per currency."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="r-from" className="text-ink-3">From</label>
            <Input id="r-from" type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label htmlFor="r-to" className="text-ink-3">to</label>
            <Input id="r-to" type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}

      {loading && !rows ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : rows && rows.length === 0 ? (
        <Card><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="No issued invoices in this period" description="Reports appear once invoices are issued." /></Card>
      ) : rows ? (
        <div className="space-y-6">
          {currencies.length > 1 && (
            <div role="tablist" aria-label="Currency" className="inline-flex rounded-md border border-line bg-surface p-0.5">
              {currencies.map((c) => (
                <button key={c} role="tab" aria-selected={c === currency} onClick={() => setPicked(c)}
                  className={cn('rounded px-3 py-1 text-sm font-medium', c === currency ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:text-ink')}>
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={`Invoiced (${currency})`} value={formatMoney(t.total, currency)} foot={`${t.count} invoices`} />
            <Stat label="Paid" value={formatMoney(t.paid, currency)} />
            <Stat label="Outstanding" value={formatMoney(t.outstanding, currency)} />
            <Stat label="GST collected (Indian invoices)" value={formatMoney(inr.tax, 'INR')} foot={`on taxable value ${formatMoney(inr.taxable, 'INR')}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Invoice totals by month" description={currency}>
              <BarChart data={monthly}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip formatter={fmtTip} cursor={{ fill: '#f6f7f9' }} />
                <Bar dataKey="Total" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Paid vs outstanding" description={`${currency}, by invoice month`}>
              <BarChart data={monthly}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip formatter={fmtTip} cursor={{ fill: '#f6f7f9' }} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Paid" stackId="a" fill={PAID} maxBarSize={36} />
                <Bar dataKey="Outstanding" stackId="a" fill={OUTSTANDING} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Invoice totals by country" description={`Top 10, ${currency}`}>
              <BarChart data={countries} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={fmtTip} cursor={{ fill: '#f6f7f9' }} />
                <Bar dataKey="Total" fill={ACCENT} radius={[0, 3, 3, 0]} maxBarSize={22} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Invoice count over time" description="All currencies">
              <LineChart data={counts}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip />
                <Line type="monotone" dataKey="count" name="Invoices" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartCard>

            {inr.count > 0 && (
              <ChartCard title="GST collected on Indian invoices" description="INR, tax-inclusive extraction">
                <BarChart data={byMonth(rows, 'INR', months).map((b) => ({ label: b.label, Tax: toChart(b.tax) }))}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tickFormatter={(v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v)} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip formatter={(v: unknown) => formatMoney(BigInt(Math.round(Number(v) * 100)), 'INR')} cursor={{ fill: '#f6f7f9' }} />
                  <Bar dataKey="Tax" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ChartCard>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] font-medium text-ink-3">{label}</div>
      <div className="tabular mt-2 text-[20px] font-semibold tracking-tight">{value}</div>
      {foot && <div className="mt-1 text-[12px] text-ink-3">{foot}</div>}
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactElement }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="h-72 p-4">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}
