import { supabase } from './supabase';
import type {
  Client, CompanySettings, DashboardSummary, Invoice, InvoiceStatus, InvoiceWithItems, PaymentStatus, Profile,
} from '@/types/db';

/** Throw Supabase errors so callers can use try/catch + toAppError. */
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

const str = (v: unknown) => (v === null || v === undefined ? v : String(v));
function normaliseInvoice<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of ['subtotal', 'taxable_value', 'tax_rate', 'tax_amount', 'grand_total', 'paid_amount']) out[k] = str(out[k]);
  if (Array.isArray(out.invoice_items)) {
    out.invoice_items = (out.invoice_items as Record<string, unknown>[])
      .map((i) => ({ ...i, quantity: str(i.quantity), unit_price: str(i.unit_price), line_total: str(i.line_total) }))
      .sort((a, b) => Number((a as Record<string, unknown>).sort_order) - Number((b as Record<string, unknown>).sort_order));
  }
  return out as T;
}

// ---------------------------------------------------------------- settings
export async function fetchSettings(): Promise<CompanySettings> {
  return check(await supabase.from('company_settings').select('*').eq('id', 1).single()) as CompanySettings;
}

export type SettingsUpdate = Partial<Omit<CompanySettings, 'id' | 'updated_at'>>;
export async function updateSettings(patch: SettingsUpdate): Promise<CompanySettings> {
  return check(await supabase.from('company_settings').update(patch).eq('id', 1).select('*').single()) as CompanySettings;
}

// ---------------------------------------------------------------- invoices
export interface InvoiceFilters {
  search?: string;
  country?: string;
  state?: string;
  paymentStatus?: PaymentStatus | '';
  invoiceStatus?: InvoiceStatus | '' | 'active';
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  sort?: 'invoice_date' | 'invoice_number' | 'grand_total';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Strip characters with special meaning in LIKE patterns or PostgREST or() filters. */
function escapeLike(s: string) {
  return s.replace(/[\\%_*,()"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export async function listInvoices(f: InvoiceFilters): Promise<{ rows: Invoice[]; total: number }> {
  const page = f.page ?? 1;
  const size = f.pageSize ?? 20;
  let q = supabase
    .from('invoices')
    .select(
      'id, invoice_number, country_code, invoice_date, client_id, client_name_snapshot, client_country_snapshot, client_state_snapshot, currency_code, subtotal, taxable_value, tax_rate, tax_amount, grand_total, paid_amount, payment_status, invoice_status, created_at',
      { count: 'exact' },
    );
  const s = f.search ? escapeLike(f.search) : '';
  if (s) q = q.or(`invoice_number.ilike.%${s}%,client_name_snapshot.ilike.%${s}%`);
  if (f.country) q = q.eq('country_code', f.country);
  if (f.state) q = q.eq('client_state_snapshot', f.state);
  if (f.paymentStatus) q = q.eq('payment_status', f.paymentStatus);
  if (f.invoiceStatus === 'active') q = q.neq('invoice_status', 'cancelled');
  else if (f.invoiceStatus) q = q.eq('invoice_status', f.invoiceStatus);
  if (f.dateFrom) q = q.gte('invoice_date', f.dateFrom);
  if (f.dateTo) q = q.lte('invoice_date', f.dateTo);
  if (f.clientId) q = q.eq('client_id', f.clientId);
  const sort = f.sort ?? 'invoice_date';
  q = q.order(sort, { ascending: f.dir === 'asc' });
  if (sort !== 'invoice_number') q = q.order('invoice_number', { ascending: f.dir === 'asc' });
  q = q.range((page - 1) * size, page * size - 1);
  const res = await q;
  if (res.error) throw res.error;
  return { rows: (res.data ?? []).map((r) => normaliseInvoice(r)) as unknown as Invoice[], total: res.count ?? 0 };
}

export async function getInvoice(id: string): Promise<InvoiceWithItems> {
  const data = check(await supabase.from('invoices').select('*, invoice_items(*)').eq('id', id).single());
  return normaliseInvoice(data as Record<string, unknown>) as unknown as InvoiceWithItems;
}

export async function saveInvoice(id: string | null, payload: object, issue: boolean): Promise<string> {
  return check(await supabase.rpc('save_invoice', { p_invoice_id: id, p_payload: payload, p_issue: issue })) as string;
}

export async function previewInvoiceNumber(countryCode: string): Promise<string> {
  return check(await supabase.rpc('preview_invoice_number', { p_country_code: countryCode })) as string;
}

export async function setInvoicePaid(id: string, paid: boolean): Promise<void> {
  check(await supabase.rpc('set_invoice_paid', { p_invoice_id: id, p_paid: paid }));
}

export async function cancelInvoice(id: string, reason: string): Promise<void> {
  check(await supabase.rpc('cancel_invoice', { p_invoice_id: id, p_reason: reason }));
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  return check(await supabase.rpc('dashboard_summary')) as DashboardSummary;
}

/** Lightweight rows for reports (issued invoices only). Paged to avoid row limits. */
export interface ReportRow {
  invoice_date: string; country_code: string; client_country_snapshot: string; currency_code: string;
  grand_total: string; paid_amount: string; tax_amount: string; taxable_value: string;
}
export async function fetchReportRows(from?: string, to?: string): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  const size = 1000;
  for (let page = 0; page < 100; page++) {
    let q = supabase
      .from('invoices')
      .select('invoice_date, country_code, client_country_snapshot, currency_code, grand_total, paid_amount, tax_amount, taxable_value')
      .eq('invoice_status', 'issued')
      .order('invoice_date', { ascending: true })
      .range(page * size, page * size + size - 1);
    if (from) q = q.gte('invoice_date', from);
    if (to) q = q.lte('invoice_date', to);
    const rows = check(await q) as Record<string, unknown>[];
    out.push(...(rows.map((r) => normaliseInvoice(r)) as unknown as ReportRow[]));
    if (rows.length < size) break;
  }
  return out;
}

// ---------------------------------------------------------------- clients
export async function listClients(search = '', page = 1, pageSize = 20): Promise<{ rows: Client[]; total: number }> {
  let q = supabase.from('clients').select('*', { count: 'exact' }).order('name');
  const s = escapeLike(search);
  if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,country_name.ilike.%${s}%,country_code.ilike.%${s}%`);
  q = q.range((page - 1) * pageSize, page * pageSize - 1);
  const res = await q;
  if (res.error) throw res.error;
  return { rows: (res.data ?? []) as Client[], total: res.count ?? 0 };
}

export async function getClient(id: string): Promise<Client> {
  return check(await supabase.from('clients').select('*').eq('id', id).single()) as Client;
}

export async function findSimilarClients(name: string, countryCode: string): Promise<Client[]> {
  const s = escapeLike(name);
  if (!s) return [];
  return check(await supabase.from('clients').select('*').ilike('name', s).eq('country_code', countryCode).limit(5)) as Client[];
}

export type ClientInput = Pick<Client, 'name' | 'phone' | 'address' | 'country_code' | 'country_name' | 'state'>;
export async function createClient(input: ClientInput): Promise<Client> {
  return check(await supabase.from('clients').insert(input).select('*').single()) as Client;
}
export async function updateClient(id: string, input: ClientInput): Promise<Client> {
  return check(await supabase.from('clients').update(input).eq('id', id).select('*').single()) as Client;
}

// ---------------------------------------------------------------- users
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const res = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (res.error) throw res.error;
  return res.data as Profile | null;
}
export async function listProfiles(): Promise<Profile[]> {
  return check(await supabase.from('profiles').select('*').order('created_at')) as Profile[];
}
export async function setProfileRole(id: string, role: Profile['role']): Promise<void> {
  const res = await supabase.from('profiles').update({ role }).eq('id', id).select('id');
  if (res.error) throw res.error;
  if (!res.data?.length) throw Object.assign(new Error('not authorized'), { code: '42501' });
}
export async function inviteUser(email: string, role: 'admin' | 'staff'): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-invite-user', { body: { email, role } });
  if (error) {
    // FunctionsHttpError carries the JSON body in context
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw Object.assign(new Error(body.error), { hint: 'INVITE_FAILED' });
    }
    throw error;
  }
}
