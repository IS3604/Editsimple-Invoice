import { decimalPlaces, minorToDecimalString, parseScaled, QTY_SCALE } from './money';
import { calculateInvoice, INDIA, type TaxConfiguration } from './tax';

export interface ItemDraft {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface ClientDraft {
  name: string;
  phone: string;
  address: string;
  countryCode: string;
  countryName: string;
  state: string;
}

export interface InvoiceFormValues {
  clientId: string | null;
  saveClient: boolean;
  client: ClientDraft;
  invoiceDate: string; // YYYY-MM-DD
  items: ItemDraft[];
  paid: boolean;
  notes: string;
}

export type FieldErrors = Record<string, string>;

let keySeq = 0;
export const newItemKey = () => `item-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

export const emptyItem = (): ItemDraft => ({ key: newItemKey(), description: '', quantity: '1', unitPrice: '' });

export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyInvoiceForm(defaultDate: 'today' | 'blank' = 'today'): InvoiceFormValues {
  return {
    clientId: null,
    saveClient: true,
    client: { name: '', phone: '', address: '', countryCode: '', countryName: '', state: '' },
    invoiceDate: defaultDate === 'today' ? todayISO() : '',
    items: [emptyItem()],
    paid: false,
    notes: '',
  };
}

/**
 * Apply a country change WITHOUT losing client or item data.
 * Leaving India clears the state (it is only meaningful for Indian clients).
 */
export function applyCountryChange(values: InvoiceFormValues, code: string, name: string): InvoiceFormValues {
  return {
    ...values,
    client: { ...values.client, countryCode: code, countryName: name, state: code === INDIA ? values.client.state : '' },
  };
}

function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}

const PHONE_RE = /^[+()\-.\s\d]{4,40}$/;

/** Client-side validation. The database repeats every check. */
export function validateInvoiceForm(v: InvoiceFormValues): FieldErrors {
  const e: FieldErrors = {};
  const name = v.client.name.trim();
  if (!name) e['client.name'] = 'Client name is required.';
  else if (name.length > 200) e['client.name'] = 'Client name must be 200 characters or fewer.';
  if (v.client.phone.trim() && !PHONE_RE.test(v.client.phone.trim())) e['client.phone'] = 'Enter a valid phone number.';
  if (v.client.address.length > 1000) e['client.address'] = 'Address is too long.';
  if (!v.client.countryCode) e['client.countryCode'] = 'Client country is required.';
  if (v.client.countryCode === INDIA && !v.client.state.trim()) e['client.state'] = 'State is required for Indian clients.';
  if (!v.invoiceDate) e.invoiceDate = 'Invoice date is required.';
  else if (!isValidISODate(v.invoiceDate)) e.invoiceDate = 'Enter a valid date.';
  if (v.notes.length > 2000) e.notes = 'Notes must be 2000 characters or fewer.';

  if (v.items.length === 0) e.items = 'Add at least one item.';
  if (v.items.length > 200) e.items = 'An invoice can have at most 200 items.';
  v.items.forEach((it, i) => {
    if (!it.description.trim()) e[`items.${i}.description`] = 'Description is required.';
    else if (it.description.length > 2000) e[`items.${i}.description`] = 'Description is too long.';

    const qRaw = it.quantity.trim();
    const q = parseScaled(qRaw, QTY_SCALE);
    if (!qRaw) e[`items.${i}.quantity`] = 'Quantity is required.';
    else if (qRaw.startsWith('-')) e[`items.${i}.quantity`] = 'Quantity cannot be negative.';
    else if (/^\d+(\.\d+)?$/.test(qRaw) && decimalPlaces(qRaw) > QTY_SCALE) e[`items.${i}.quantity`] = 'Use at most 3 decimal places.';
    else if (q === null) e[`items.${i}.quantity`] = 'Enter a valid number.';
    else if (q <= 0n) e[`items.${i}.quantity`] = 'Quantity must be greater than zero.';
    else if (q >= 1_000_000_000_000n) e[`items.${i}.quantity`] = 'Quantity is too large.';

    const pRaw = it.unitPrice.trim();
    const p = parseScaled(pRaw, 2);
    if (!pRaw) e[`items.${i}.unitPrice`] = 'Unit price is required.';
    else if (pRaw.startsWith('-')) e[`items.${i}.unitPrice`] = 'Unit price cannot be negative.';
    else if (/^\d+(\.\d+)?$/.test(pRaw) && decimalPlaces(pRaw) > 2) e[`items.${i}.unitPrice`] = 'Use at most 2 decimal places.';
    else if (p === null) e[`items.${i}.unitPrice`] = 'Enter a valid amount.';
    else if (p >= 100_000_000_000_000n) e[`items.${i}.unitPrice`] = 'Amount is too large.';
  });
  return e;
}

/** Normalise "1,000.5" → "1000.5" for submission (string, never float). */
const clean = (s: string) => s.trim().replace(/,/g, '');

/** Build the save_invoice RPC payload. Totals are sent only as a cross-check. */
export function toSavePayload(v: InvoiceFormValues, taxConfig: TaxConfiguration) {
  const totals = calculateInvoice(
    v.client.countryCode,
    v.items.map((i) => ({ quantity: clean(i.quantity), unitPrice: clean(i.unitPrice) })),
    taxConfig,
    v.client.state,
  );
  return {
    client_id: v.clientId,
    save_client: v.clientId ? false : v.saveClient,
    client: {
      name: v.client.name.trim(),
      phone: v.client.phone.trim() || null,
      address: v.client.address.trim() || null,
      country_code: v.client.countryCode,
      country_name: v.client.countryName,
      state: v.client.countryCode === INDIA ? v.client.state.trim() : null,
    },
    invoice_date: v.invoiceDate,
    notes: v.notes.trim() || null,
    paid: v.paid,
    items: v.items.map((i) => ({
      description: i.description.trim(),
      quantity: clean(i.quantity),
      unit_price: clean(i.unitPrice),
    })),
    expected_grand_total: minorToDecimalString(totals.grandTotal),
  };
}
