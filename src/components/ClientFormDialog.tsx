import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { createClient, findSimilarClients, updateClient, type ClientInput } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { COUNTRIES, countryByCode } from '@/lib/countries';
import { INDIAN_STATES } from '@/lib/indian-states';
import { INDIA } from '@/lib/tax';
import type { Client } from '@/types/db';
import { Button, ErrorBanner, Field, Input, Select, Textarea, errProps } from '@/components/ui/primitives';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/AuthProvider';

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, hint: c.code }));
const empty = { name: '', phone: '', address: '', country_code: '', country_name: '', state: '' };

export function ClientFormDialog({
  open, onOpenChange, client, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client | null; onSaved: (c: Client) => void }) {
  const { handleExpired } = useAuth();
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState<Client[] | null>(null);

  useEffect(() => {
    if (open) {
      setV(client ? {
        name: client.name, phone: client.phone ?? '', address: client.address ?? '',
        country_code: client.country_code, country_name: client.country_name, state: client.state ?? '',
      } : empty);
      setErrors({});
      setFormError(null);
      setDupes(null);
    }
  }, [open, client]);

  function validate() {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = 'Client name is required.';
    if (v.phone.trim() && !/^[+()\-.\s\d]{4,40}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number.';
    if (!v.country_code) e.country = 'Client country is required.';
    if (v.country_code === INDIA && !v.state) e.state = 'State is required for Indian clients.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save(force = false) {
    if (!validate()) return;
    setBusy(true);
    setFormError(null);
    try {
      if (!client && !force) {
        const matches = await findSimilarClients(v.name, v.country_code);
        if (matches.length) { setDupes(matches); return; }
      }
      const input: ClientInput = {
        name: v.name.trim(),
        phone: v.phone.trim() || null,
        address: v.address.trim() || null,
        country_code: v.country_code,
        country_name: v.country_name,
        state: v.country_code === INDIA ? v.state : null,
      };
      const saved = client ? await updateClient(client.id, input) : await createClient(input);
      toast.success(client ? 'Client updated. Existing invoices keep their original details.' : 'Client added.');
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      const ae = toAppError(e);
      if (ae.sessionExpired) handleExpired();
      setFormError(ae.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={client ? 'Edit client' : 'Add client'}
      description={client ? 'Changes apply to future invoices only.' : undefined}
      footer={dupes ? (
        <>
          <Button onClick={() => setDupes(null)}>Go back</Button>
          <Button variant="primary" loading={busy} onClick={() => void save(true)}>Create anyway</Button>
        </>
      ) : (
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>{client ? 'Save changes' : 'Add client'}</Button>
        </>
      )}
    >
      {dupes ? (
        <div className="space-y-3 text-sm">
          <p>A client with this name already exists in {v.country_name}:</p>
          <ul className="space-y-1.5">
            {dupes.map((d) => (
              <li key={d.id} className="rounded-md border border-line px-3 py-2">
                <div className="font-medium">{d.name}</div>
                <div className="text-ink-3">{[d.state, d.phone].filter(Boolean).join(' · ') || 'No other details'}</div>
              </li>
            ))}
          </ul>
          <p className="text-ink-3">Create a separate record only if this is a different client.</p>
        </div>
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-4 sm:grid-cols-2">
          {formError && <div className="sm:col-span-2"><ErrorBanner message={formError} /></div>}
          <Field id="c-name" label="Client Name" kind="required" error={errors.name} className="sm:col-span-2">
            <Input {...errProps('c-name', errors.name)} maxLength={200} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field id="c-phone" label="Client Phone Number" error={errors.phone}>
            <Input {...errProps('c-phone', errors.phone)} type="tel" maxLength={40} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field id="c-country" label="Client Country" kind="required" error={errors.country}>
            <Combobox id="c-country" value={v.country_code} options={COUNTRY_OPTIONS} invalid={Boolean(errors.country)} placeholder="Select country…" searchPlaceholder="Search countries…"
              onChange={(code) => setV({ ...v, country_code: code, country_name: countryByCode(code)?.name ?? code, state: code === INDIA ? v.state : '' })} />
          </Field>
          {v.country_code === INDIA && (
            <Field id="c-state" label="State" kind="required" error={errors.state}>
              <Select {...errProps('c-state', errors.state)} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          )}
          <Field id="c-address" label="Client Address" className="sm:col-span-2">
            <Textarea id="c-address" rows={3} maxLength={1000} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
          </Field>
          <button type="submit" hidden />
        </form>
      )}
    </Dialog>
  );
}
