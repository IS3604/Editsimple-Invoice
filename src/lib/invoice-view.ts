import type { CompanySettings, CompanySnapshot, InvoiceStatus, InvoiceWithItems, PaymentLine, PaymentStatus } from '@/types/db';
import { decimalStringToMinor, parseScaled } from './money';
import { bpToPercentLabel, calculateInvoice, currencyForCountry, INDIA, rateToBp, type TaxConfiguration } from './tax';
import type { InvoiceFormValues } from './invoice-form';

/** One rendering model shared by the on-screen preview and the PDF. */
export interface InvoiceView {
  number: string | null;
  date: string;
  invoiceStatus: InvoiceStatus | 'unsaved';
  paymentStatus: PaymentStatus;
  company: CompanySnapshot;
  client: { name: string; phone: string | null; address: string | null; country: string; state: string | null };
  currency: string;
  isIndia: boolean;
  items: { description: string; quantity: string; unitPrice: bigint | null; lineTotal: bigint | null }[];
  subtotal: bigint;
  taxableValue: bigint;
  taxAmount: bigint;
  taxRateLabel: string;
  split:
    | { type: 'igst'; rate: string; igst: bigint }
    | { type: 'cgst_sgst'; rate: string; cgst: bigint; sgst: bigint }
    | null;
  grandTotal: bigint;
  paidAmount: bigint;
  paymentRegion: 'IN' | 'INTL';
  paymentLines: PaymentLine[];
  notes: string | null;
  cancelReason?: string | null;
}

const minor = (v: string | number) => decimalStringToMinor(String(v));

export function viewFromInvoice(inv: InvoiceWithItems): InvoiceView {
  const isIndia = inv.country_code === INDIA;
  const rateBp = rateToBp(inv.tax_rate);
  const s = inv.tax_split;
  return {
    number: inv.invoice_number,
    date: inv.invoice_date,
    invoiceStatus: inv.invoice_status,
    paymentStatus: inv.payment_status,
    company: inv.company_snapshot,
    client: {
      name: inv.client_name_snapshot,
      phone: inv.client_phone_snapshot,
      address: inv.client_address_snapshot,
      country: inv.client_country_snapshot,
      state: inv.client_state_snapshot,
    },
    currency: inv.currency_code,
    isIndia,
    items: inv.invoice_items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: minor(i.unit_price),
      lineTotal: minor(i.line_total),
    })),
    subtotal: minor(inv.subtotal),
    taxableValue: minor(inv.taxable_value),
    taxAmount: minor(inv.tax_amount),
    taxRateLabel: bpToPercentLabel(rateBp),
    split: s?.type === 'igst'
      ? { type: 'igst', rate: bpToPercentLabel(rateToBp(s.igst_rate)), igst: minor(s.igst) }
      : s?.type === 'cgst_sgst'
        ? { type: 'cgst_sgst', rate: bpToPercentLabel(rateToBp(s.cgst_rate)), cgst: minor(s.cgst), sgst: minor(s.sgst) }
        : null,
    grandTotal: minor(inv.grand_total),
    paidAmount: minor(inv.paid_amount),
    paymentRegion: inv.payment_snapshot.region,
    paymentLines: inv.payment_snapshot.details?.lines ?? [],
    notes: inv.notes,
    cancelReason: inv.cancel_reason,
  };
}

/** Live preview model for an unsaved (or being-edited) invoice. */
export function viewFromForm(
  v: InvoiceFormValues,
  settings: CompanySettings,
  taxConfig: TaxConfiguration,
  opts: { number: string | null; status: InvoiceStatus | 'unsaved'; companyOverride?: CompanySnapshot; paymentOverride?: { region: 'IN' | 'INTL'; lines: PaymentLine[] }; currencyOverride?: string },
): InvoiceView {
  const isIndia = v.client.countryCode === INDIA;
  const clean = (s: string) => s.trim().replace(/,/g, '');
  const t = calculateInvoice(
    v.client.countryCode,
    v.items.map((i) => ({ quantity: clean(i.quantity), unitPrice: clean(i.unitPrice) })),
    taxConfig,
    v.client.state,
  );
  const region: 'IN' | 'INTL' = isIndia ? 'IN' : 'INTL';
  const payment = opts.paymentOverride && opts.paymentOverride.region === region
    ? opts.paymentOverride
    : { region, lines: (isIndia ? settings.indian_payment_details : settings.international_payment_details)?.lines ?? [] };
  return {
    number: opts.number,
    date: v.invoiceDate,
    invoiceStatus: opts.status,
    paymentStatus: v.paid ? 'paid' : 'unpaid',
    company: opts.companyOverride ?? {
      company_name: settings.company_name,
      company_email: settings.company_email,
      company_address: settings.company_address,
      gstin: settings.gstin,
      pdf_footer_text: settings.pdf_footer_text,
      payment_terms: settings.payment_terms,
    },
    client: {
      name: v.client.name.trim(),
      phone: v.client.phone.trim() || null,
      address: v.client.address.trim() || null,
      country: v.client.countryName,
      state: isIndia ? v.client.state || null : null,
    },
    currency: opts.currencyOverride ?? currencyForCountry(v.client.countryCode, settings.default_currency),
    isIndia,
    items: v.items.map((i, idx) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: parseScaled(clean(i.unitPrice), 2),
      lineTotal: t.lineTotals[idx] ?? null,
    })),
    subtotal: t.subtotal,
    taxableValue: t.taxableValue,
    taxAmount: t.taxAmount,
    taxRateLabel: bpToPercentLabel(t.taxRateBp),
    split: t.split?.type === 'igst'
      ? { type: 'igst', rate: bpToPercentLabel(t.split.igstRateBp), igst: t.split.igst }
      : t.split?.type === 'cgst_sgst'
        ? { type: 'cgst_sgst', rate: bpToPercentLabel(t.split.halfRateBp), cgst: t.split.cgst, sgst: t.split.sgst }
        : null,
    grandTotal: t.grandTotal,
    paidAmount: v.paid ? t.grandTotal : 0n,
    paymentRegion: payment.region,
    paymentLines: payment.lines,
    notes: v.notes.trim() || null,
  };
}
