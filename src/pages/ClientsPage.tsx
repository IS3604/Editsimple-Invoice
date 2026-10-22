import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, Search, UserPlus, Users } from 'lucide-react';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { listClients } from '@/lib/api';
import type { Client } from '@/types/db';
import { Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Skeleton } from '@/components/ui/primitives';
import { ClientFormDialog } from '@/components/ClientFormDialog';

const PAGE = 20;

export function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search, 300);
  const { data, loading, error, reload } = useAsync(() => listClients(q, page, PAGE), [q, page]);
  const [editing, setEditing] = useState<Client | null | undefined>(undefined);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <>
      <PageHeader
        title="Clients"
        description="Saved client details for quick reuse. Editing a client never changes past invoices."
        actions={<Button variant="primary" onClick={() => setEditing(null)}><UserPlus className="h-4 w-4" /> Add client</Button>}
      />
      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-sm">
            <label htmlFor="client-search" className="sr-only">Search clients</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input id="client-search" className="pl-9" placeholder="Name, phone or country" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
        </div>
        {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[12px] text-ink-3">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Country</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-b border-line">{Array.from({ length: 5 }, (__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>)}</tr>
                ))
                : data?.rows.map((c) => (
                  <tr key={c.id} className="border-b border-line hover:bg-canvas/70">
                    <td className="px-4 py-2.5"><Link to={`/clients/${c.id}`} className="font-medium hover:text-accent hover:underline">{c.name}</Link></td>
                    <td className="px-4 py-2.5 text-ink-2">{c.phone ?? '—'}</td>
                    <td className="px-4 py-2.5">{c.country_name}</td>
                    <td className="px-4 py-2.5 text-ink-2">{c.state ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {data && data.rows.length === 0 && (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={q ? 'No clients match your search' : 'No clients yet'}
            description={q ? undefined : 'Clients are saved automatically when you create an invoice, or add one here.'}
            action={!q && <Button variant="primary" onClick={() => setEditing(null)}>Add client</Button>}
          />
        )}
        {data && data.total > PAGE && (
          <nav aria-label="Pagination" className="flex items-center justify-end gap-2 px-4 py-3 text-sm text-ink-3">
            <Button size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span>Page {page} of {pages}</span>
            <Button size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </nav>
        )}
      </Card>
      <ClientFormDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        client={editing}
        onSaved={(c) => { if (editing === null) navigate(`/clients/${c.id}`); else void reload(); }}
      />
    </>
  );
}
