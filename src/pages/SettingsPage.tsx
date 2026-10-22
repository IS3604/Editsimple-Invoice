import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2, UserPlus } from 'lucide-react';
import { useSettings } from '@/features/settings/SettingsProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { useAsync } from '@/hooks/useAsync';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { inviteUser, listProfiles, setProfileRole, updateSettings } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { INDIAN_STATES } from '@/lib/indian-states';
import type { AppRole, CompanySettings, PaymentLine } from '@/types/db';
import { Badge, Button, Card, CardHeader, ErrorBanner, Field, Input, PageHeader, Select, Skeleton, Textarea, errProps } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';

type Draft = Omit<CompanySettings, 'id' | 'updated_at'>;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];

export function SettingsPage() {
  const { settings, setSettings } = useSettings();
  const { handleExpired } = useAuth();
  const toDraft = (s: CompanySettings): Draft => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, updated_at: _u, ...rest } = s;
    return structuredClone(rest);
  };
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings!));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings!));
  const blocker = useUnsavedChanges(dirty && !saving);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!draft.company_name.trim()) e.company_name = 'Company name is required.';
    if (!/^\S+@\S+\.\S+$/.test(draft.company_email.trim())) e.company_email = 'Enter a valid email.';
    if (!draft.company_address.trim()) e.company_address = 'Address is required.';
    if (draft.gstin && !/^[0-9A-Z]{15}$/.test(draft.gstin.trim())) e.gstin = 'GSTIN must be 15 letters/digits.';
    const rate = String(draft.tax_configuration.india_tax_rate);
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(rate) || Number(rate) > 100) e.rate = 'Enter a rate between 0 and 100.';
    for (const [key, lines] of [['indian', draft.indian_payment_details.lines], ['intl', draft.international_payment_details.lines]] as const) {
      (lines ?? []).forEach((l, i) => { if (!l.value.trim()) e[`${key}.${i}`] = 'Value is required.'; });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) { setFormError('Please fix the highlighted fields.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const clean = (lines?: PaymentLine[]) => ({ lines: (lines ?? []).map((l) => ({ label: l.label.trim(), value: l.value.trim() })) });
      const saved = await updateSettings({
        ...draft,
        company_name: draft.company_name.trim(),
        company_email: draft.company_email.trim(),
        gstin: draft.gstin?.trim() || null,
        payment_terms: draft.payment_terms?.trim() || null,
        indian_payment_details: clean(draft.indian_payment_details.lines),
        international_payment_details: clean(draft.international_payment_details.lines),
        tax_configuration: { ...draft.tax_configuration, india_tax_rate: Number(draft.tax_configuration.india_tax_rate) },
      });
      setSettings(saved);
      setDraft(toDraft(saved));
      toast.success('Settings saved. New invoices will use these details; issued invoices are unchanged.');
    } catch (e) {
      const ae = toAppError(e);
      if (ae.sessionExpired) handleExpired();
      setFormError(ae.message);
      toast.error(ae.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Administrator only. Changes apply to new invoices and drafts; issued invoices keep the details they were issued with."
        actions={
          <>
            {dirty && <Button onClick={() => { setDraft(toDraft(settings!)); setErrors({}); }}>Discard</Button>}
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>Save settings</Button>
          </>
        }
      />
      {formError && <div className="mb-4"><ErrorBanner message={formError} /></div>}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Company information" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field id="s-name" label="Company name" kind="required" error={errors.company_name}>
              <Input {...errProps('s-name', errors.company_name)} value={draft.company_name} onChange={(e) => set({ company_name: e.target.value })} />
            </Field>
            <Field id="s-email" label="Company email" kind="required" error={errors.company_email}>
              <Input {...errProps('s-email', errors.company_email)} type="email" value={draft.company_email} onChange={(e) => set({ company_email: e.target.value })} />
            </Field>
            <Field id="s-address" label="Company address" kind="required" error={errors.company_address}>
              <Textarea {...errProps('s-address', errors.company_address)} rows={3} value={draft.company_address} onChange={(e) => set({ company_address: e.target.value })} />
            </Field>
            <Field id="s-gstin" label="GSTIN" error={errors.gstin} hint="Shown on Indian invoices.">
              <Input {...errProps('s-gstin', errors.gstin)} className="uppercase" maxLength={15} value={draft.gstin ?? ''} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} />
            </Field>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <PaymentLinesEditor
            title="Indian payment information"
            description="Shown on invoices for clients in India."
            prefix="indian"
            errors={errors}
            lines={draft.indian_payment_details.lines ?? []}
            onChange={(lines) => set({ indian_payment_details: { lines } })}
          />
          <PaymentLinesEditor
            title="International payment information"
            description="Shown on invoices for all other countries."
            prefix="intl"
            errors={errors}
            lines={draft.international_payment_details.lines ?? []}
            onChange={(lines) => set({ international_payment_details: { lines } })}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Tax configuration" description="Applies to Indian clients. Prices are always treated as tax-inclusive." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field id="s-rate" label="GST rate (%)" kind="required" error={errors.rate}>
                <Input {...errProps('s-rate', errors.rate)} inputMode="decimal" value={String(draft.tax_configuration.india_tax_rate)}
                  onChange={(e) => set({ tax_configuration: { ...draft.tax_configuration, india_tax_rate: e.target.value } })} />
              </Field>
              <Field id="s-split" label="Tax breakdown on invoice">
                <Select id="s-split" value={draft.tax_configuration.india_split_mode}
                  onChange={(e) => set({ tax_configuration: { ...draft.tax_configuration, india_split_mode: e.target.value as Draft['tax_configuration']['india_split_mode'] } })}>
                  <option value="none">Single “Tax” line</option>
                  <option value="igst">IGST (full rate)</option>
                  <option value="cgst_sgst">CGST + SGST (half each)</option>
                  <option value="auto_by_state">Automatic by client state</option>
                </Select>
              </Field>
              {draft.tax_configuration.india_split_mode === 'auto_by_state' && (
                <Field id="s-supplier-state" label="Your registered state" hint="Same state → CGST + SGST; other states → IGST." className="sm:col-span-2">
                  <Select id="s-supplier-state" value={draft.tax_configuration.supplier_state ?? ''}
                    onChange={(e) => set({ tax_configuration: { ...draft.tax_configuration, supplier_state: e.target.value } })}>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              )}
              <p className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn sm:col-span-2">
                This is a simplified country-based rule, not a complete determination of tax liability. Confirm the correct treatment (including IGST vs CGST/SGST and export of services) with your tax adviser.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Invoice defaults" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field id="s-currency" label="International currency" hint="Indian invoices always use INR.">
                <Select id="s-currency" value={draft.default_currency} onChange={(e) => set({ default_currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field id="s-date" label="Default invoice date">
                <Select id="s-date" value={draft.default_invoice_date} onChange={(e) => set({ default_invoice_date: e.target.value as 'today' | 'blank' })}>
                  <option value="today">Today's date</option>
                  <option value="blank">Leave blank</option>
                </Select>
              </Field>
              <Field id="s-terms" label="Payment terms" className="sm:col-span-2" hint="Optional, printed on every invoice.">
                <Textarea id="s-terms" rows={2} maxLength={1000} value={draft.payment_terms ?? ''} onChange={(e) => set({ payment_terms: e.target.value })} />
              </Field>
              <Field id="s-footer" label="PDF footer text" className="sm:col-span-2">
                <Input id="s-footer" maxLength={300} value={draft.pdf_footer_text} onChange={(e) => set({ pdf_footer_text: e.target.value })} />
              </Field>
            </div>
          </Card>
        </div>

        <UsersCard />
      </div>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Discard unsaved settings?"
        footer={
          <>
            <Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>Keep editing</Button>
            <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()}>Discard</Button>
          </>
        }
      />
    </>
  );
}

function PaymentLinesEditor({ title, description, prefix, lines, errors, onChange }: {
  title: string; description: string; prefix: string; lines: PaymentLine[]; errors: Record<string, string>; onChange: (l: PaymentLine[]) => void;
}) {
  const update = (i: number, patch: Partial<PaymentLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...lines];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="space-y-2 p-5">
        <div className="hidden grid-cols-[140px_minmax(0,1fr)_96px] gap-2 text-[12px] font-medium text-ink-3 sm:grid">
          <span>Label</span><span>Value</span><span />
        </div>
        {lines.length === 0 && <p className="text-sm text-ink-3">No details yet. Add the lines that should appear under “Payment info”.</p>}
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_96px] sm:items-start">
            <Input aria-label={`${title} line ${i + 1} label`} placeholder="e.g. IFSC Code" value={l.label} onChange={(e) => update(i, { label: e.target.value })} />
            <div>
              <Textarea
                aria-label={`${title} line ${i + 1} value`}
                aria-invalid={errors[`${prefix}.${i}`] ? true : undefined}
                rows={l.value.includes('\n') ? 2 : 1}
                className="min-h-9 py-1.5"
                value={l.value}
                onChange={(e) => update(i, { value: e.target.value })}
              />
              {errors[`${prefix}.${i}`] && <p className="mt-1 text-[12px] text-danger">{errors[`${prefix}.${i}`]}</p>}
            </div>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === lines.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <Button size="sm" className="mt-1" onClick={() => onChange([...lines, { label: '', value: '' }])}><Plus className="h-4 w-4" /> Add line</Button>
        <p className="pt-1 text-[12px] text-ink-3">Leave the label empty for a heading line (e.g. the account holder name).</p>
      </div>
    </Card>
  );
}

function UsersCard() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useAsync(() => listProfiles(), []);
  const [invite, setInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  useEffect(() => { if (!invite) { setEmail(''); setInviteErr(null); } }, [invite]);

  async function changeRole(id: string, r: AppRole) {
    setBusy(id);
    try {
      await setProfileRole(id, r);
      toast.success('Role updated.');
      await reload();
    } catch (e) {
      toast.error(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setInviteErr('Enter a valid email address.'); return; }
    setBusy('invite');
    setInviteErr(null);
    try {
      await inviteUser(email.trim(), role);
      toast.success(`Invitation sent to ${email.trim()}.`);
      setInvite(false);
      await reload();
    } catch (e) {
      setInviteErr(toAppError(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Authorised users"
        description="Only Admin and Staff accounts can see business data. New sign-ins start as Pending (no access)."
        actions={<Button size="sm" onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" /> Invite user</Button>}
      />
      {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[12px] text-ink-3">
              <th className="px-5 py-2.5 font-medium">User</th>
              <th className="px-5 py-2.5 font-medium">Added</th>
              <th className="px-5 py-2.5 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr><td colSpan={3} className="px-5 py-4"><Skeleton className="h-4 w-48" /></td></tr>
            ) : data?.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-5 py-2.5">
                  <div className="font-medium">{p.full_name || p.email}</div>
                  {p.full_name && <div className="text-ink-3">{p.email}</div>}
                </td>
                <td className="px-5 py-2.5 text-ink-2">{formatDate(p.created_at)}</td>
                <td className="px-5 py-2.5">
                  {p.id === session?.user.id ? (
                    <Badge tone="accent">{p.role} (you)</Badge>
                  ) : (
                    <Select aria-label={`Role for ${p.email}`} className="w-36" value={p.role} disabled={busy === p.id} onChange={(e) => void changeRole(p.id, e.target.value as AppRole)}>
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="pending">Pending (no access)</option>
                    </Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={invite}
        onOpenChange={setInvite}
        title="Invite a user"
        description="They'll receive an email link to set a password. Requires the admin-invite-user Edge Function to be deployed."
        footer={
          <>
            <Button onClick={() => setInvite(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'invite'} onClick={() => void sendInvite()}>Send invitation</Button>
          </>
        }
      >
        <div className="space-y-4">
          {inviteErr && <ErrorBanner message={inviteErr} />}
          <Field id="inv-email" label="Email" kind="required">
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="inv-role" label="Role">
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}>
              <option value="staff">Staff — invoices &amp; clients</option>
              <option value="admin">Admin — everything incl. settings</option>
            </Select>
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}
