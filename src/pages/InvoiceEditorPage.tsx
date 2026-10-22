import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, FileCheck2, Info, Save, UserRound } from 'lucide-react';
import { useSettings } from '@/features/settings/SettingsProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { findSimilarClients, getInvoice, listClients, previewInvoiceNumber, saveInvoice } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { COUNTRIES, countryByCode } from '@/lib/countries';
import { INDIAN_STATES } from '@/lib/indian-states';
import {
  applyCountryChange, emptyInvoiceForm, toSavePayload, validateInvoiceForm,
  type FieldErrors, type InvoiceFormValues,
} from '@/lib/invoice-form';
import { calculateInvoice, currencyForCountry, INDIA } from '@/lib/tax';
import { formatMoney } from '@/lib/money';
import { viewFromForm } from '@/lib/invoice-view';
import type { Client, InvoiceWithItems } from '@/types/db';
import {
  Badge, Button, Card, CardHeader, Checkbox, ErrorBanner, Field, Input, PageHeader, Select, Spinner, Textarea, errProps,
} from '@/components/ui/primitives';
import { Combobox } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { ItemsEditor } from '@/components/invoice/ItemsEditor';
import { InvoiceDocument } from '@/components/invoice/InvoiceDocument';
import { InvoiceStatusBadge } from '@/components/invoice/StatusBadges';

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, hint: c.code }));

function formFromInvoice(inv: InvoiceWithItems): InvoiceFormValues {
  return {
    clientId: inv.client_id,
    saveClient: false,
    client: {
      name: inv.client_name_snapshot,
      phone: inv.client_phone_snapshot ?? '',
      address: inv.client_address_snapshot ?? '',
      countryCode: inv.country_code,
      countryName: inv.client_country_snapshot,
      state: inv.client_state_snapshot ?? '',
    },
    invoiceDate: inv.invoice_date,
    items: inv.invoice_items.map((i) => ({ key: i.id, description: i.description, quantity: i.quantity, unitPrice: i.unit_price })),
    paid: inv.payment_status === 'paid',
    notes: inv.notes ?? '',
  };
}

export function InvoiceEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { data: existing, loading, error, reload } = useAsync(() => (id ? getInvoice(id) : Promise.resolve(null)), [id]);

  if (isEdit && loading) return <Spinner label="Loading invoice" />;
  if (isEdit && error) return <ErrorBanner message={error} onRetry={reload} />;
  if (existing?.invoice_status === 'cancelled') {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Invoice {existing.invoice_number} is cancelled and can no longer be edited.</p>
        <Link to={`/invoices/${existing.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">View invoice</Link>
      </Card>
    );
  }
  return <InvoiceEditor key={id ?? 'new'} existing={existing} />;
}

function InvoiceEditor({ existing }: { existing: InvoiceWithItems | null }) {
  const navigate = useNavigate();
  const { handleExpired } = useAuth();
  const { settings, taxConfig } = useSettings();
  const s = settings!;
  const initial = useMemo(
    () => (existing ? formFromInvoice(existing) : emptyInvoiceForm(s.default_invoice_date)),
    [existing, s.default_invoice_date],
  );
  const [values, setValues] = useState<InvoiceFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'draft' | 'issue' | null>(null);
  const [previewNumber, setPreviewNumber] = useState<string | null>(null);
  const [dupes, setDupes] = useState<{ matches: Client[]; issue: boolean } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const submittedOnce = useRef(false);
  const justSaved = useRef(false);

  const dirty = !justSaved.current && JSON.stringify(values) !== JSON.stringify(initial);
  const blocker = useUnsavedChanges(dirty && saving === null);

  const isIssued = existing?.invoice_status === 'issued';
  const countryLocked = Boolean(existing);
  const isIndia = values.client.countryCode === INDIA;

  // Issued invoices keep the company/bank details they were issued with.
  const snapshotOverrides = isIssued && existing
    ? {
      companyOverride: existing.company_snapshot,
      paymentOverride: { region: existing.payment_snapshot.region, lines: existing.payment_snapshot.details?.lines ?? [] },
      currencyOverride: existing.currency_code,
    }
    : {};
  const currency = snapshotOverrides.currencyOverride ?? currencyForCountry(values.client.countryCode, s.default_currency);

  const totals = useMemo(() => calculateInvoice(
    values.client.countryCode,
    values.items.map((i) => ({ quantity: i.quantity.trim().replace(/,/g, ''), unitPrice: i.unitPrice.trim().replace(/,/g, '') })),
    taxConfig,
    values.client.state,
  ), [values.client.countryCode, values.client.state, values.items, taxConfig]);

  // Live invoice-number preview for NEW invoices (not reserved until save).
  const debouncedCountry = useDebounced(values.client.countryCode, 250);
  useEffect(() => {
    if (existing || !debouncedCountry) { setPreviewNumber(null); return; }
    let live = true;
    previewInvoiceNumber(debouncedCountry)
      .then((n) => { if (live) setPreviewNumber(n); })
      .catch(() => { if (live) setPreviewNumber(null); });
    return () => { live = false; };
  }, [debouncedCountry, existing]);

  // Saved clients for quick reuse
  const { data: clientList } = useAsync(() => listClients('', 1, 1000), []);
  const clientOptions = useMemo(
    () => (clientList?.rows ?? []).map((c) => ({ value: c.id, label: c.name, hint: c.country_code })),
    [clientList],
  );

  // Re-validate as the user types once they have tried to submit.
  useEffect(() => {
    if (submittedOnce.current) setErrors(validateInvoiceForm(values));
  }, [values]);

  const set = (patch: Partial<InvoiceFormValues>) => setValues((v) => ({ ...v, ...patch }));
  const setClient = (patch: Partial<InvoiceFormValues['client']>) =>
    setValues((v) => ({ ...v, clientId: null, client: { ...v.client, ...patch } }));

  function pickClient(id: string) {
    const c = clientList?.rows.find((x) => x.id === id);
    if (!c) return;
    if (countryLocked && c.country_code !== values.client.countryCode) {
      toast.error(`This invoice is for ${values.client.countryName}; pick a client from the same country.`);
      return;
    }
    setValues((v) => ({
      ...v,
      clientId: c.id,
      saveClient: false,
      client: { name: c.name, phone: c.phone ?? '', address: c.address ?? '', countryCode: c.country_code, countryName: c.country_name, state: c.state ?? '' },
    }));
  }

  async function submit(issue: boolean, skipDupeCheck = false) {
    submittedOnce.current = true;
    const errs = validateInvoiceForm(values);
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) {
      setFormError('Please fix the highlighted fields.');
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }

    if (!skipDupeCheck && !values.clientId && values.saveClient) {
      try {
        const matches = await findSimilarClients(values.client.name, values.client.countryCode);
        if (matches.length) { setDupes({ matches, issue }); return; }
      } catch { /* non-fatal: fall through to save */ }
    }

    setSaving(issue ? 'issue' : 'draft');
    try {
      const payload = toSavePayload(values, taxConfig);
      const newId = await saveInvoice(existing?.id ?? null, payload, issue);
      justSaved.current = true;
      toast.success(existing ? 'Invoice updated.' : issue ? 'Invoice saved and issued.' : 'Draft saved.');
      navigate(`/invoices/${newId}${existing ? '' : '?created=1'}`, { replace: Boolean(existing) });
    } catch (e) {
      const ae = toAppError(e);
      if (ae.sessionExpired) handleExpired();
      if (ae.field) setErrors((prev) => ({ ...prev, [ae.field!]: ae.message }));
      setFormError(ae.message);
      toast.error(ae.message);
    } finally {
      setSaving(null);
    }
  }

  const view = viewFromForm(values, s, taxConfig, {
    number: existing?.invoice_number ?? previewNumber,
    status: existing?.invoice_status ?? 'unsaved',
    ...snapshotOverrides,
  });

  const title = existing ? `Edit ${existing.invoice_number}` : 'Create Invoice';

  return (
    <>
      <PageHeader
        title={title}
        description={existing ? 'Changes recalculate totals; the invoice number never changes.' : 'Fields marked * are required. Auto fields are calculated for you.'}
        actions={
          <>
            {existing && <InvoiceStatusBadge status={existing.invoice_status} />}
            <Button className="xl:hidden" onClick={() => setShowPreview(true)}><Eye className="h-4 w-4" /> Preview</Button>
          </>
        }
      />

      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); void submit(true); }}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]"
      >
        <div className="space-y-6">
          {formError && <ErrorBanner message={formError} />}

          {/* -------------------------------- Client information */}
          <Card>
            <CardHeader
              title="Client Information"
              actions={clientOptions.length > 0 && (
                <div className="w-56">
                  <label htmlFor="pick-client" className="sr-only">Use a saved client</label>
                  <Combobox id="pick-client" value={values.clientId ?? ''} options={clientOptions} onChange={pickClient} placeholder="Use saved client…" searchPlaceholder="Search clients…" />
                </div>
              )}
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {values.clientId && (
                <div className="flex items-center justify-between gap-3 rounded-md bg-accent-soft px-3 py-2 text-[13px] text-accent sm:col-span-2">
                  <span className="flex items-center gap-2"><UserRound className="h-4 w-4" /> Using saved client. Editing any field detaches it (the saved record won't change).</span>
                </div>
              )}
              <Field id="client-name" label="Client Name" kind="required" error={errors['client.name']} className="sm:col-span-2">
                <Input {...errProps('client-name', errors['client.name'])} autoComplete="organization" maxLength={200} value={values.client.name} onChange={(e) => setClient({ name: e.target.value })} />
              </Field>
              <Field id="client-phone" label="Client Phone Number" error={errors['client.phone']}>
                <Input {...errProps('client-phone', errors['client.phone'])} type="tel" autoComplete="tel" maxLength={40} value={values.client.phone} onChange={(e) => setClient({ phone: e.target.value })} />
              </Field>
              <Field
                id="client-country"
                label="Client Country"
                kind="required"
                error={errors['client.countryCode']}
                hint={countryLocked ? 'Locked: the invoice number depends on the country.' : undefined}
              >
                <Combobox
                  id="client-country"
                  value={values.client.countryCode}
                  options={COUNTRY_OPTIONS}
                  disabled={countryLocked}
                  invalid={Boolean(errors['client.countryCode'])}
                  describedBy={errors['client.countryCode'] ? 'client-country-error' : undefined}
                  placeholder="Select country…"
                  searchPlaceholder="Search countries…"
                  onChange={(code) => {
                    const c = countryByCode(code);
                    setValues((v) => ({ ...applyCountryChange(v, code, c?.name ?? code), clientId: null }));
                  }}
                />
              </Field>
              {isIndia && (
                <Field id="client-state" label="State" kind="required" error={errors['client.state']}>
                  <Select {...errProps('client-state', errors['client.state'])} value={values.client.state} onChange={(e) => setClient({ state: e.target.value })}>
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </Select>
                </Field>
              )}
              <Field id="client-address" label="Client Address" error={errors['client.address']} className="sm:col-span-2">
                <Textarea {...errProps('client-address', errors['client.address'])} rows={3} maxLength={1000} autoComplete="street-address" value={values.client.address} onChange={(e) => setClient({ address: e.target.value })} />
              </Field>
              {!values.clientId && !existing && (
                <div className="sm:col-span-2">
                  <Checkbox id="save-client" checked={values.saveClient} onChange={(v) => set({ saveClient: v })} label="Save to Clients" description="Reuse these details on future invoices." />
                </div>
              )}
            </div>
          </Card>

          {/* -------------------------------- Invoice details */}
          <Card>
            <CardHeader title="Invoice Details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field
                id="invoice-number"
                label="Invoice Number"
                kind="auto"
                hint={existing ? 'Permanent.' : values.client.countryCode ? 'Preview — the final number is reserved when you save.' : 'Select a country to generate.'}
              >
                <Input id="invoice-number" readOnly tabIndex={-1} className="bg-canvas font-medium tabular" value={existing?.invoice_number ?? previewNumber ?? '—'} />
              </Field>
              <Field id="invoice-date" label="Date" kind="auto" error={errors.invoiceDate} hint="Filled in automatically; you can change it.">
                <Input {...errProps('invoice-date', errors.invoiceDate)} type="date" value={values.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
              </Field>
            </div>
          </Card>

          {/* -------------------------------- Items */}
          <Card>
            <CardHeader
              title="Invoice Items"
              description={isIndia ? 'Enter prices INCLUSIVE of GST. Tax is extracted, never added on top.' : 'Prices are entered without tax.'}
            />
            <div className="p-5">
              <ItemsEditor items={values.items} lineTotals={totals.lineTotals} currency={currency} errors={errors} onChange={(items) => set({ items })} />
            </div>
          </Card>

          {/* -------------------------------- Totals + payment */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Tax and Totals" />
              <dl className="tabular space-y-2 p-5 text-sm">
                <TotalLine label={isIndia ? 'Subtotal (Inclusive of Tax)' : 'Subtotal'} value={formatMoney(totals.subtotal, currency)} />
                {isIndia ? (
                  <>
                    <TotalLine label="Taxable Value" value={formatMoney(totals.taxableValue, currency)} muted />
                    {totals.split?.type === 'cgst_sgst' ? (
                      <>
                        <TotalLine label={`CGST (${view.split?.rate} Inclusive)`} value={formatMoney(totals.split.cgst, currency)} muted />
                        <TotalLine label={`SGST (${view.split?.rate} Inclusive)`} value={formatMoney(totals.split.sgst, currency)} muted />
                      </>
                    ) : (
                      <TotalLine label={`${totals.split?.type === 'igst' ? 'IGST' : 'Tax'} (${view.taxRateLabel} Inclusive)`} value={formatMoney(totals.taxAmount, currency)} muted />
                    )}
                  </>
                ) : (
                  <TotalLine label="Tax (0%)" value={formatMoney(0n, currency)} muted />
                )}
                <div className="flex items-baseline justify-between border-t border-line pt-3 text-base font-semibold">
                  <dt>Grand Total</dt><dd>{formatMoney(totals.grandTotal, currency)}</dd>
                </div>
                {!values.client.countryCode && (
                  <p className="flex items-center gap-1.5 pt-1 text-[12.5px] text-ink-3"><Info className="h-3.5 w-3.5" /> Select a country to apply the correct tax.</p>
                )}
              </dl>
            </Card>

            <Card>
              <CardHeader title="Payment Information" description={values.client.countryCode ? (isIndia ? 'Indian bank details' : 'International bank details') : undefined} />
              <div className="space-y-4 p-5">
                <Checkbox
                  id="paid"
                  checked={values.paid}
                  onChange={(v) => set({ paid: v })}
                  label="Paid"
                  description={values.paid ? 'Marked fully paid — outstanding balance is zero.' : `Outstanding: ${formatMoney(totals.grandTotal, currency)}`}
                />
                {values.client.countryCode ? (
                  view.paymentLines.length ? (
                    <dl className="space-y-0.5 rounded-md bg-canvas p-3 text-[12.5px]">
                      {view.paymentLines.map((l, i) => (
                        <div key={i}>{l.label && <dt className="inline text-ink-3">{l.label}: </dt>}<dd className="inline whitespace-pre-line">{l.value}</dd></div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-[12.5px] text-warn">Payment details are not configured yet — add them in Settings.</p>
                  )
                ) : (
                  <p className="text-[12.5px] text-ink-3">Shown once a country is selected.</p>
                )}
                {isIssued && <Badge tone="neutral">Using the details this invoice was issued with</Badge>}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Notes" description="Optional — printed on the invoice." />
            <div className="p-5">
              <Field id="notes" label="Notes" error={errors.notes}>
                <Textarea {...errProps('notes', errors.notes)} rows={3} maxLength={2000} value={values.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </Card>

          {/* -------------------------------- Actions */}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
            <span className="mr-auto text-sm text-ink-3">
              Total <strong className="tabular text-ink">{formatMoney(totals.grandTotal, currency)}</strong>
            </span>
            <Button onClick={() => navigate(-1)} disabled={saving !== null}>Cancel</Button>
            {(!existing || existing.invoice_status === 'draft') && (
              <Button onClick={() => void submit(false)} loading={saving === 'draft'} disabled={saving !== null}>
                <Save className="h-4 w-4" /> Save Draft
              </Button>
            )}
            <Button type="submit" variant="primary" loading={saving === 'issue'} disabled={saving !== null}>
              <FileCheck2 className="h-4 w-4" />
              {existing?.invoice_status === 'issued' ? 'Save Changes' : 'Save Invoice'}
            </Button>
          </div>
        </div>

        {/* -------------------------------- Live preview */}
        <aside className="hidden xl:block" aria-label="Invoice preview">
          <div className="sticky top-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-2">Invoice Preview</h2>
              <span className="text-[12px] text-ink-3">PDF available after saving</span>
            </div>
            <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg shadow-[var(--shadow-card)]">
              <InvoiceDocument view={view} />
            </div>
          </div>
        </aside>
      </form>

      <Dialog open={showPreview} onOpenChange={setShowPreview} title="Invoice Preview" className="max-w-3xl">
        <InvoiceDocument view={view} />
      </Dialog>

      <Dialog
        open={dupes !== null}
        onOpenChange={(o) => !o && setDupes(null)}
        title="A similar client already exists"
        description="Reuse the saved client, or create a separate record?"
        footer={
          <>
            <Button onClick={() => { const d = dupes; setDupes(null); setValues((v) => ({ ...v, saveClient: false })); if (d) void submit(d.issue, true); }}>
              Don't save client
            </Button>
            <Button variant="primary" onClick={() => { const d = dupes; setDupes(null); if (d) void submit(d.issue, true); }}>
              Create new client
            </Button>
          </>
        }
      >
        <ul className="space-y-2">
          {dupes?.matches.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-line p-3">
              <div className="min-w-0 text-sm">
                <div className="font-medium">{c.name}</div>
                <div className="truncate text-ink-3">{[c.state, c.country_name, c.phone].filter(Boolean).join(' · ')}</div>
              </div>
              <Button size="sm" onClick={() => { pickClient(c.id); setDupes(null); toast.info('Saved client selected — review and save again.'); }}>Use this</Button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Discard unsaved changes?"
        description="You have changes on this invoice that haven't been saved."
        footer={
          <>
            <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>Keep editing</Button>
            <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>Discard changes</Button>
          </>
        }
      />
    </>
  );
}

function TotalLine({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${muted ? 'text-ink-2' : ''}`}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>
  );
}
