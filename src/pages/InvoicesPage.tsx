import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import type { InvoiceFilters } from '@/lib/api';
import { Button, Card, PageHeader } from '@/components/ui/primitives';
import { DEFAULT_FILTERS, InvoiceTable } from '@/components/invoice/InvoiceTable';

const KEYS = ['search', 'country', 'state', 'paymentStatus', 'invoiceStatus', 'dateFrom', 'dateTo', 'sort', 'dir', 'page', 'pageSize'] as const;

/** Filters live in the URL so views can be bookmarked and survive refresh. */
export function InvoicesPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<InvoiceFilters>(() => {
    const f: Record<string, unknown> = { ...DEFAULT_FILTERS };
    for (const k of KEYS) {
      const v = params.get(k);
      if (v !== null) f[k] = k === 'page' || k === 'pageSize' ? Math.max(1, Number(v) || 1) : v;
    }
    return f as InvoiceFilters;
  }, [params]);

  const onChange = (f: InvoiceFilters) => {
    const next = new URLSearchParams();
    for (const k of KEYS) {
      const v = f[k];
      if (v !== undefined && v !== '' && v !== DEFAULT_FILTERS[k]) next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="All Invoices"
        description="Search, filter and manage every invoice. Cancelled invoices are kept for your records."
        actions={<Link to="/invoices/new"><Button variant="primary"><FilePlus2 className="h-4 w-4" /> Create Invoice</Button></Link>}
      />
      <Card><InvoiceTable filters={filters} onChange={onChange} /></Card>
    </>
  );
}
