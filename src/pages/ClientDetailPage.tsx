import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { getClient, type InvoiceFilters } from '@/lib/api';
import { Button, Card, CardHeader, ErrorBanner, PageHeader, Spinner } from '@/components/ui/primitives';
import { ClientFormDialog } from '@/components/ClientFormDialog';
import { DEFAULT_FILTERS, InvoiceTable } from '@/components/invoice/InvoiceTable';

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const { data: client, loading, error, reload, setData } = useAsync(() => getClient(id), [id]);
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<InvoiceFilters>({ ...DEFAULT_FILTERS, invoiceStatus: '', clientId: id, pageSize: 10 });

  if (loading && !client) return <Spinner label="Loading client" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!client) return null;

  return (
    <>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Clients</Link>
      <PageHeader
        title={client.name}
        description={[client.state, client.country_name].filter(Boolean).join(', ')}
        actions={
          <>
            <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            <Link to="/invoices/new"><Button variant="primary">New invoice</Button></Link>
          </>
        }
      />
      <Card className="mb-6">
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-4">
          <div><dt className="text-ink-3">Phone</dt><dd className="mt-0.5">{client.phone ?? '—'}</dd></div>
          <div><dt className="text-ink-3">Country</dt><dd className="mt-0.5">{client.country_name} ({client.country_code})</dd></div>
          <div><dt className="text-ink-3">State</dt><dd className="mt-0.5">{client.state ?? '—'}</dd></div>
          <div className="sm:col-span-4"><dt className="text-ink-3">Address</dt><dd className="mt-0.5 whitespace-pre-line">{client.address ?? '—'}</dd></div>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Invoices for this client" description="Invoices linked to this saved client record." />
        <InvoiceTable filters={filters} onChange={(f) => setFilters({ ...f, clientId: id })} />
      </Card>
      <ClientFormDialog open={editing} onOpenChange={setEditing} client={client} onSaved={setData} />
    </>
  );
}
