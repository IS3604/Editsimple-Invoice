// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { InvoicePdf, registerPdfFonts } from './InvoicePdf';
import { viewFromInvoice } from '@/lib/invoice-view';
import type { InvoiceWithItems } from '@/types/db';

const company = {
  company_name: 'EditSimple Editing Services Private Limited',
  company_email: 'billing@example.test',
  company_address: 'Test address line 1\nTest City - 000000, India',
  gstin: '00AAAAA0000A0Z0',
  pdf_footer_text: 'Thank you for your business.',
  payment_terms: 'Due within 15 days.',
};

function invoice(overrides: Partial<InvoiceWithItems> = {}, itemCount = 1): InvoiceWithItems {
  return {
    id: 'x', invoice_number: 'IN0001', country_code: 'IN', invoice_date: '2026-10-22', client_id: null,
    client_name_snapshot: 'Sample Client Pvt Ltd', client_phone_snapshot: '+91 00000 00000', client_address_snapshot: '1 Sample Road',
    client_country_snapshot: 'India', client_state_snapshot: 'Goa', currency_code: 'INR',
    subtotal: '1180.00', taxable_value: '1000.00', tax_rate: '18.00', tax_amount: '180.00', tax_split: null,
    grand_total: '1180.00', paid_amount: '0.00', payment_status: 'unpaid', invoice_status: 'issued', notes: null,
    company_snapshot: company,
    payment_snapshot: { region: 'IN', details: { lines: [{ label: '', value: 'EditSimple Editing Services Private Limited' }, { label: 'IFSC Code', value: 'TEST0000000' }] } },
    issued_at: null, cancelled_at: null, cancel_reason: null, created_at: '', updated_at: '',
    invoice_items: Array.from({ length: itemCount }, (_, i) => ({
      id: String(i), invoice_id: 'x', description: i % 7 === 3 ? 'Long description '.repeat(30) : `Video editing — episode ${i + 1}`,
      quantity: '1', unit_price: itemCount === 1 ? '1180.00' : '10.00', line_total: itemCount === 1 ? '1180.00' : '10.00', sort_order: i,
    })),
    ...overrides,
  };
}

registerPdfFonts(path.resolve(import.meta.dirname, '../../../public'));
const outDir = process.env.PDF_SAMPLE_DIR;

async function render(inv: InvoiceWithItems, name: string) {
  const buf = await renderToBuffer(<InvoicePdf view={viewFromInvoice(inv)} />);
  if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(path.join(outDir, name), buf); }
  return buf;
}

describe('invoice PDF', () => {
  it('renders a valid single-page Indian invoice', async () => {
    const buf = await render(invoice(), 'india.pdf');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1')).toMatch(/\/Count 1\b/);
  });

  it('renders an international invoice', async () => {
    const buf = await render(invoice({
      invoice_number: 'US0001', country_code: 'US', client_country_snapshot: 'United States', client_state_snapshot: null,
      currency_code: 'USD', subtotal: '1000.00', taxable_value: '1000.00', tax_rate: '0.00', tax_amount: '0.00', grand_total: '1000.00',
      paid_amount: '1000.00', payment_status: 'paid',
      payment_snapshot: { region: 'INTL', details: { lines: [{ label: 'Routing Number', value: '000000000' }] } },
      invoice_items: [{ id: '1', invoice_id: 'x', description: 'Editing', quantity: '1', unit_price: '1000.00', line_total: '1000.00', sort_order: 0 }],
    }), 'international.pdf');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('paginates long invoices across multiple pages', async () => {
    const buf = await render(invoice({ subtotal: '600.00', taxable_value: '508.47', tax_amount: '91.53', grand_total: '600.00', invoice_status: 'cancelled' }, 60), 'multipage.pdf');
    const m = buf.toString('latin1').match(/\/Count (\d+)/);
    expect(Number(m?.[1])).toBeGreaterThan(1);
  });
});
