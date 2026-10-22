/**
 * Database tests: migrations, RLS, invoice numbering (incl. concurrency),
 * server-side tax calculation and invoice lifecycle.
 * Run with: npm run test:db   (uses scripts/test-db.sh)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — run via scripts/test-db.sh');

const admin = new pg.Pool({ connectionString: url, max: 30 });

type Role = 'anon' | 'authenticated';
interface Actor { role: Role; sub?: string }

/** Run fn inside a transaction impersonating a Supabase request. */
async function as<T>(actor: Actor, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await admin.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(actor.sub ? { sub: actor.sub, role: actor.role } : { role: actor.role }),
    ]);
    await c.query(`set local role ${actor.role}`);
    const result = await fn(c);
    await c.query('commit');
    return result;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function createUser(email: string, role: 'admin' | 'staff' | 'pending') {
  const { rows } = await admin.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = rows[0].id as string;
  await admin.query(`update public.profiles set role = $2 where id = $1`, [id, role]);
  return id;
}

const india = (gross: string | number, extra: Record<string, unknown> = {}) => ({
  client: { name: 'Test Client India', country_code: 'IN', country_name: 'India', state: 'Maharashtra' },
  invoice_date: '2026-10-01',
  items: [{ description: 'Video editing', quantity: 1, unit_price: gross }],
  ...extra,
});
const usa = (gross: string | number, extra: Record<string, unknown> = {}) => ({
  client: { name: 'Test Client US', country_code: 'US', country_name: 'United States' },
  invoice_date: '2026-10-01',
  items: [{ description: 'Video editing', quantity: 1, unit_price: gross }],
  ...extra,
});

async function save(sub: string, payload: object, id: string | null = null, issue = true) {
  return as({ role: 'authenticated', sub }, async (c) => {
    const { rows } = await c.query('select public.save_invoice($1, $2::jsonb, $3) as id', [id, JSON.stringify(payload), issue]);
    return rows[0].id as string;
  });
}
async function getInvoice(id: string) {
  const { rows } = await admin.query('select * from public.invoices where id = $1', [id]);
  return rows[0];
}

let adminId = '';
let staffId = '';
let pendingId = '';

beforeAll(async () => {
  adminId = await createUser('admin@example.test', 'admin');
  staffId = await createUser('staff@example.test', 'staff');
  pendingId = await createUser('pending@example.test', 'pending');
});
afterAll(async () => { await admin.end(); });

describe('access control (RLS + grants)', () => {
  it('anonymous users cannot read any business table', async () => {
    for (const t of ['invoices', 'invoice_items', 'clients', 'company_settings', 'profiles', 'invoice_sequences']) {
      await expect(as({ role: 'anon' }, (c) => c.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
    }
  });

  it('anonymous users cannot call RPCs', async () => {
    await expect(as({ role: 'anon' }, (c) => c.query(`select public.save_invoice(null, '{}'::jsonb, true)`)))
      .rejects.toThrow(/permission denied/);
  });

  it('signed-in but unapproved (pending) users see no data and cannot create invoices', async () => {
    await save(adminId, india(500));
    const rows = await as({ role: 'authenticated', sub: pendingId }, async (c) => (await c.query('select * from public.invoices')).rows);
    expect(rows).toHaveLength(0);
    const settings = await as({ role: 'authenticated', sub: pendingId }, async (c) => (await c.query('select * from public.company_settings')).rows);
    expect(settings).toHaveLength(0);
    await expect(save(pendingId, india(100))).rejects.toThrow(/not authorized/);
  });

  it('pending users can read only their own profile and cannot promote themselves', async () => {
    const rows = await as({ role: 'authenticated', sub: pendingId }, async (c) => (await c.query('select id from public.profiles')).rows);
    expect(rows.map((r) => r.id)).toEqual([pendingId]);
    const res = await as({ role: 'authenticated', sub: pendingId }, (c) =>
      c.query(`update public.profiles set role = 'admin' where id = $1`, [pendingId]));
    expect(res.rowCount).toBe(0);
    const { rows: p } = await admin.query('select role from public.profiles where id = $1', [pendingId]);
    expect(p[0].role).toBe('pending');
  });

  it('nobody can write invoices directly — only through RPCs', async () => {
    await expect(as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`update public.invoices set grand_total = 1`))).rejects.toThrow(/permission denied/);
    await expect(as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`delete from public.invoice_items`))).rejects.toThrow(/permission denied/);
  });

  it('allocate_invoice_number cannot be called directly to burn numbers', async () => {
    await expect(as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`select public.allocate_invoice_number('IN')`))).rejects.toThrow(/permission denied/);
  });

  it('only admins can change company settings', async () => {
    const staffUpd = await as({ role: 'authenticated', sub: staffId }, (c) =>
      c.query(`update public.company_settings set company_email = 'x@example.test'`));
    expect(staffUpd.rowCount).toBe(0);
    const adminUpd = await as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`update public.company_settings set payment_terms = 'Due on receipt'`));
    expect(adminUpd.rowCount).toBe(1);
  });

  it('staff can read invoices and create them through the RPC', async () => {
    const id = await save(staffId, usa(10));
    const rows = await as({ role: 'authenticated', sub: staffId }, async (c) =>
      (await c.query('select id from public.invoices where id = $1', [id])).rows);
    expect(rows).toHaveLength(1);
  });

  it('the last admin cannot be demoted', async () => {
    await expect(as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`update public.profiles set role = 'staff' where id = $1`, [adminId]))).rejects.toThrow(/administrator must remain/);
  });
});

describe('tax calculation (server)', () => {
  it('Indian invoice: ₹1,180 inclusive → taxable 1000, tax 180, total 1180', async () => {
    const inv = await getInvoice(await save(adminId, india(1180)));
    expect(inv.subtotal).toBe('1180.00');
    expect(inv.taxable_value).toBe('1000.00');
    expect(inv.tax_amount).toBe('180.00');
    expect(inv.tax_rate).toBe('18.00');
    expect(inv.grand_total).toBe('1180.00');
    expect(inv.currency_code).toBe('INR');
  });

  it('International invoice: $1,000 → tax 0, total 1000', async () => {
    const inv = await getInvoice(await save(adminId, usa(1000)));
    expect(inv.subtotal).toBe('1000.00');
    expect(inv.tax_amount).toBe('0.00');
    expect(inv.tax_rate).toBe('0.00');
    expect(inv.grand_total).toBe('1000.00');
    expect(inv.currency_code).toBe('USD');
    expect(inv.client_state_snapshot).toBeNull();
  });

  it('multiple items with decimal quantities and prices', async () => {
    const id = await save(adminId, india(0, {
      items: [
        { description: 'A', quantity: 2.5, unit_price: 99.99 },  // 249.975 -> 249.98
        { description: 'B', quantity: 3, unit_price: 0.1 },      // 0.30
        { description: 'C', quantity: 0.333, unit_price: 10 },   // 3.33
      ],
    }));
    const inv = await getInvoice(id);
    expect(inv.subtotal).toBe('253.61');
    expect(inv.taxable_value).toBe('214.92'); // 253.61 / 1.18 = 214.9237…
    expect(inv.tax_amount).toBe('38.69');
    expect(Number(inv.taxable_value) + Number(inv.tax_amount)).toBeCloseTo(Number(inv.subtotal), 10);
    const { rows: items } = await admin.query('select line_total from public.invoice_items where invoice_id = $1 order by sort_order', [id]);
    expect(items.map((i) => i.line_total)).toEqual(['249.98', '0.30', '3.33']);
  });

  it('rejects a save when the browser total does not match the server total', async () => {
    await expect(save(adminId, india(1180, { expected_grand_total: 1392.4 }))).rejects.toThrow(/Totals changed/);
  });

  it('validation: State is required for India', async () => {
    const p = india(100);
    (p.client as Record<string, unknown>).state = '';
    await expect(save(adminId, p)).rejects.toThrow(/State is required/);
  });

  it('validation: a state sent for a non-Indian client is dropped', async () => {
    const p = usa(100);
    (p.client as Record<string, unknown>).state = 'Maharashtra';
    const inv = await getInvoice(await save(adminId, p));
    expect(inv.client_state_snapshot).toBeNull();
  });

  it('validation: quantity must be > 0 and price >= 0; at least one item', async () => {
    await expect(save(adminId, india(0, { items: [{ description: 'x', quantity: 0, unit_price: 1 }] }))).rejects.toThrow(/quantity/);
    await expect(save(adminId, india(0, { items: [{ description: 'x', quantity: 1, unit_price: -1 }] }))).rejects.toThrow(/unit price/);
    await expect(save(adminId, india(0, { items: [] }))).rejects.toThrow(/At least one/);
    await expect(save(adminId, india(0, { items: [{ description: ' ', quantity: 1, unit_price: 1 }] }))).rejects.toThrow(/description/);
  });

  it('CGST/SGST split reconciles to the total tax', async () => {
    await admin.query(`update public.company_settings set tax_configuration = tax_configuration || '{"india_split_mode":"cgst_sgst"}'`);
    try {
      const inv = await getInvoice(await save(adminId, india(1000)));
      // 1000/1.18 = 847.457… → 847.46 ; tax 152.54 ; halves 76.27 + 76.27
      expect(inv.tax_amount).toBe('152.54');
      expect(Number(inv.tax_split.cgst) + Number(inv.tax_split.sgst)).toBeCloseTo(152.54, 10);
    } finally {
      await admin.query(`update public.company_settings set tax_configuration = tax_configuration || '{"india_split_mode":"none"}'`);
    }
  });
});

describe('invoice numbering', () => {
  it('numbers are per-country, sequential and zero-padded', async () => {
    const before = (await admin.query(`select last_value from public.invoice_sequences where country_code = 'GB'`)).rows[0];
    expect(before).toBeUndefined();
    const gb = { client: { name: 'UK client', country_code: 'GB', country_name: 'United Kingdom' }, invoice_date: '2026-10-02', items: [{ description: 'x', quantity: 1, unit_price: 5 }] };
    const a = await getInvoice(await save(adminId, gb));
    const b = await getInvoice(await save(adminId, gb));
    expect(a.invoice_number).toBe('GB0001');
    expect(b.invoice_number).toBe('GB0002');
    const firstIn = (await admin.query(`select min(invoice_number) n from public.invoices where country_code = 'IN'`)).rows[0];
    expect(firstIn.n).toBe('IN0001');
  });

  it('preview does not consume a number', async () => {
    const preview = async () => as({ role: 'authenticated', sub: adminId }, async (c) =>
      (await c.query(`select public.preview_invoice_number('FR') n`)).rows[0].n as string);
    expect(await preview()).toBe('FR0001');
    expect(await preview()).toBe('FR0001');
  });

  it('concurrent creation never produces duplicates or gaps', async () => {
    const N = 25;
    const ids = await Promise.all(Array.from({ length: N }, () => save(adminId, {
      client: { name: 'Concurrent', country_code: 'DE', country_name: 'Germany' },
      invoice_date: '2026-10-03', items: [{ description: 'x', quantity: 1, unit_price: 1 }],
    })));
    const { rows } = await admin.query('select invoice_number from public.invoices where id = any($1) order by invoice_number', [ids]);
    const numbers = rows.map((r) => r.invoice_number as string);
    expect(new Set(numbers).size).toBe(N);
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => `DE${String(i + 1).padStart(4, '0')}`));
  });

  it('editing keeps the number; changing the country is refused', async () => {
    const id = await save(adminId, india(100));
    const before = await getInvoice(id);
    await save(adminId, india(250, { client: { name: 'Renamed', country_code: 'IN', country_name: 'India', state: 'Goa' } }), id);
    const after = await getInvoice(id);
    expect(after.invoice_number).toBe(before.invoice_number);
    expect(after.grand_total).toBe('250.00');
    expect(after.client_name_snapshot).toBe('Renamed');
    await expect(save(adminId, usa(100), id)).rejects.toThrow(/cannot be changed/);
  });

  it('drafts reserve their number across re-saves and keep it when issued', async () => {
    const id = await save(adminId, usa(50), null, false);
    const draft = await getInvoice(id);
    expect(draft.invoice_status).toBe('draft');
    await save(adminId, usa(60), id, false);
    await save(adminId, usa(70), id, true);
    const issued = await getInvoice(id);
    expect(issued.invoice_number).toBe(draft.invoice_number);
    expect(issued.invoice_status).toBe('issued');
    expect(issued.issued_at).not.toBeNull();
  });

  it('cancelled invoices keep their number, are frozen, and numbers are never reused', async () => {
    const id = await save(adminId, usa(10));
    const inv = await getInvoice(id);
    await as({ role: 'authenticated', sub: adminId }, (c) => c.query('select public.cancel_invoice($1, $2)', [id, 'Test']));
    const cancelled = await getInvoice(id);
    expect(cancelled.invoice_status).toBe('cancelled');
    expect(cancelled.invoice_number).toBe(inv.invoice_number);
    await expect(save(adminId, usa(20), id)).rejects.toThrow(/Cancelled/);
    const next = await getInvoice(await save(adminId, usa(10)));
    expect(Number(next.invoice_number.slice(2))).toBe(Number(inv.invoice_number.slice(2)) + 1);
    await expect(admin.query('delete from public.invoices where id = $1', [id])).rejects.toThrow(/cannot be deleted/);
  });

  it('the invoice number column itself is immutable', async () => {
    const id = await save(adminId, usa(10));
    await expect(admin.query(`update public.invoices set invoice_number = 'US9999' where id = $1`, [id]))
      .rejects.toThrow(/permanent/);
  });
});

describe('payment status', () => {
  it('paid checkbox sets paid_amount = grand total; outstanding = 0', async () => {
    const inv = await getInvoice(await save(adminId, india(1180, { paid: true })));
    expect(inv.payment_status).toBe('paid');
    expect(inv.paid_amount).toBe('1180.00');
    expect(Number(inv.grand_total) - Number(inv.paid_amount)).toBe(0);
  });

  it('unpaid: outstanding equals grand total; can be toggled', async () => {
    const id = await save(adminId, india(500));
    let inv = await getInvoice(id);
    expect(inv.payment_status).toBe('unpaid');
    expect(Number(inv.grand_total) - Number(inv.paid_amount)).toBe(500);
    await as({ role: 'authenticated', sub: adminId }, (c) => c.query('select public.set_invoice_paid($1, true)', [id]));
    inv = await getInvoice(id);
    expect(inv.payment_status).toBe('paid');
    await as({ role: 'authenticated', sub: adminId }, (c) => c.query('select public.set_invoice_paid($1, false)', [id]));
    inv = await getInvoice(id);
    expect(inv.payment_status).toBe('unpaid');
    expect(inv.paid_amount).toBe('0.00');
  });

  it('paid amount can never exceed the grand total', async () => {
    const id = await save(adminId, india(100));
    await expect(admin.query('update public.invoices set paid_amount = 101 where id = $1', [id])).rejects.toThrow(/invoices_paid_not_over/);
  });

  it('dashboard summary groups by currency and excludes drafts/cancelled', async () => {
    const s = await as({ role: 'authenticated', sub: adminId }, async (c) => (await c.query('select public.dashboard_summary() s')).rows[0].s);
    const codes = s.by_currency.map((r: { currency_code: string }) => r.currency_code);
    expect(codes).toContain('INR');
    expect(codes).toContain('USD');
    const { rows } = await admin.query(`select count(*)::int n from public.invoices where invoice_status = 'issued'`);
    expect(s.invoice_count).toBe(rows[0].n);
    for (const r of s.by_currency) {
      expect(Number(r.total_value) - Number(r.total_paid)).toBeCloseTo(Number(r.total_outstanding), 10);
    }
  });
});

describe('historical stability', () => {
  it('issued invoices keep their payment/company snapshot when settings change; drafts pick up changes', async () => {
    const issuedId = await save(adminId, india(100));
    const draftId = await save(adminId, india(100), null, false);
    await admin.query(`update public.company_settings set company_email = 'new@example.test'`);
    await save(adminId, india(120), issuedId);
    await save(adminId, india(120), draftId, false);
    expect((await getInvoice(issuedId)).company_snapshot.company_email).not.toBe('new@example.test');
    expect((await getInvoice(draftId)).company_snapshot.company_email).toBe('new@example.test');
  });

  it('editing a client record does not change historical invoices', async () => {
    const id = await save(adminId, india(100, { save_client: true }));
    const inv = await getInvoice(id);
    expect(inv.client_id).not.toBeNull();
    await as({ role: 'authenticated', sub: adminId }, (c) =>
      c.query(`update public.clients set name = 'Changed name' where id = $1`, [inv.client_id]));
    expect((await getInvoice(id)).client_name_snapshot).toBe('Test Client India');
  });

  it('international invoices snapshot the international bank details', async () => {
    const inv = await getInvoice(await save(adminId, usa(1)));
    expect(inv.payment_snapshot.region).toBe('INTL');
    const labels = inv.payment_snapshot.details.lines.map((l: { label: string }) => l.label);
    expect(labels).toContain('Routing Number');
    expect(labels).not.toContain('IFSC Code');
  });
});
