import { divRoundHalfUp, parseScaled, QTY_SCALE } from './money';

export const INDIA = 'IN';

export type SplitMode = 'none' | 'igst' | 'cgst_sgst' | 'auto_by_state';

export interface TaxConfiguration {
  india_tax_rate: number | string;
  india_split_mode: SplitMode;
  supplier_state?: string;
}

export const DEFAULT_TAX_CONFIG: TaxConfiguration = {
  india_tax_rate: 18,
  india_split_mode: 'none',
  supplier_state: 'Madhya Pradesh',
};

export type TaxSplit =
  | { type: 'igst'; igstRateBp: bigint; igst: bigint }
  | { type: 'cgst_sgst'; halfRateBp: bigint; cgst: bigint; sgst: bigint }
  | null;

export interface LineInput { quantity: string; unitPrice: string }

export interface InvoiceTotals {
  /** per-line totals in minor units; null where the line is invalid */
  lineTotals: (bigint | null)[];
  /** Gross subtotal (tax-inclusive for India) */
  subtotal: bigint;
  taxableValue: bigint;
  taxAmount: bigint;
  grandTotal: bigint;
  /** tax rate in basis points (1800 = 18.00%) */
  taxRateBp: bigint;
  split: TaxSplit;
  isIndia: boolean;
  /** true when every line parsed cleanly */
  complete: boolean;
}

/** "18" / 18 / "18.5" → basis points */
export function rateToBp(rate: number | string): bigint {
  const bp = parseScaled(String(rate), 2);
  if (bp === null) throw new RangeError(`Invalid tax rate: ${rate}`);
  return bp;
}

export function bpToPercentLabel(bp: bigint): string {
  const whole = bp / 100n;
  const frac = bp % 100n;
  return frac === 0n ? `${whole}%` : `${whole}.${frac.toString().padStart(2, '0').replace(/0$/, '')}%`;
}

/** Line Total = Quantity × Unit Price, rounded to 2 dp (half up). */
export function lineTotalMinor(quantity: string, unitPrice: string): bigint | null {
  const q = parseScaled(quantity, QTY_SCALE); // ×1000
  const p = parseScaled(unitPrice, 2); // ×100
  if (q === null || p === null || q <= 0n || p < 0n) return null;
  return divRoundHalfUp(q * p, 1000n);
}

/**
 * Country-based, tax-INCLUSIVE calculation. Mirrors
 * public.compute_invoice_tax() in the database exactly.
 *
 * India:          taxable = gross ÷ (1 + rate) ; tax = gross − taxable ; total = gross
 * Other countries: tax = 0 ; total = gross
 */
export function calculateInvoice(
  countryCode: string | null | undefined,
  lines: LineInput[],
  taxConfig: TaxConfiguration = DEFAULT_TAX_CONFIG,
  clientState?: string | null,
): InvoiceTotals {
  const isIndia = countryCode === INDIA;
  const lineTotals = lines.map((l) => lineTotalMinor(l.quantity, l.unitPrice));
  const subtotal = lineTotals.reduce<bigint>((s, v) => s + (v ?? 0n), 0n);
  const taxRateBp = isIndia ? rateToBp(taxConfig.india_tax_rate) : 0n;

  const taxableValue = divRoundHalfUp(subtotal * 10000n, 10000n + taxRateBp);
  const taxAmount = subtotal - taxableValue;

  let split: TaxSplit = null;
  if (isIndia && taxRateBp > 0n) {
    let mode = taxConfig.india_split_mode;
    if (mode === 'auto_by_state') {
      const a = (clientState ?? '').trim().toLowerCase();
      const b = (taxConfig.supplier_state ?? '').trim().toLowerCase();
      mode = a !== '' && a === b ? 'cgst_sgst' : 'igst';
    }
    if (mode === 'igst') split = { type: 'igst', igstRateBp: taxRateBp, igst: taxAmount };
    if (mode === 'cgst_sgst') {
      const cgst = divRoundHalfUp(taxAmount, 2n);
      split = { type: 'cgst_sgst', halfRateBp: taxRateBp / 2n, cgst, sgst: taxAmount - cgst };
    }
  }

  return {
    lineTotals,
    subtotal,
    taxableValue,
    taxAmount,
    grandTotal: subtotal,
    taxRateBp,
    split,
    isIndia,
    complete: lineTotals.every((v) => v !== null),
  };
}

/** Outstanding balance = grand total − paid amount (never below zero). */
export function outstandingMinor(grandTotal: bigint, paidAmount: bigint): bigint {
  const o = grandTotal - paidAmount;
  return o > 0n ? o : 0n;
}

/** Paid checkbox → paid amount. Checked means FULLY paid. */
export function paidAmountFromCheckbox(paid: boolean, grandTotal: bigint): bigint {
  return paid ? grandTotal : 0n;
}

export function currencyForCountry(countryCode: string | null | undefined, internationalDefault = 'USD'): string {
  return countryCode === INDIA ? 'INR' : internationalDefault;
}
