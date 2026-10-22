import type { ReportRow } from './api';
import { decimalStringToMinor } from './money';

export interface MonthBucket { month: string; label: string; total: bigint; paid: bigint; tax: bigint; count: number }

const monthKey = (iso: string) => iso.slice(0, 7);
export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Every month between from..to (inclusive) so charts show gaps as zero. */
export function monthRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let [y, m] = fromISO.slice(0, 7).split('-').map(Number) as [number, number];
  const [ty, tm] = toISO.slice(0, 7).split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 240) break;
  }
  return out;
}

export function currenciesIn(rows: ReportRow[]): string[] {
  return [...new Set(rows.map((r) => r.currency_code))].sort((a, b) => (a === 'INR' ? -1 : b === 'INR' ? 1 : a.localeCompare(b)));
}

/** Monthly totals for ONE currency (never mix INR and USD). */
export function byMonth(rows: ReportRow[], currency: string, months: string[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>(months.map((k) => [k, { month: k, label: monthLabel(k), total: 0n, paid: 0n, tax: 0n, count: 0 }]));
  for (const r of rows) {
    if (r.currency_code !== currency) continue;
    const b = map.get(monthKey(r.invoice_date));
    if (!b) continue;
    b.total += decimalStringToMinor(r.grand_total);
    b.paid += decimalStringToMinor(r.paid_amount);
    b.tax += decimalStringToMinor(r.tax_amount);
    b.count += 1;
  }
  return [...map.values()];
}

/** Invoice count per month across all currencies. */
export function countByMonth(rows: ReportRow[], months: string[]) {
  const map = new Map(months.map((k) => [k, 0]));
  for (const r of rows) {
    const k = monthKey(r.invoice_date);
    if (map.has(k)) map.set(k, map.get(k)! + 1);
  }
  return months.map((k) => ({ month: k, label: monthLabel(k), count: map.get(k) ?? 0 }));
}

export function byCountry(rows: ReportRow[], currency: string) {
  const map = new Map<string, { country: string; code: string; total: bigint; count: number }>();
  for (const r of rows) {
    if (r.currency_code !== currency) continue;
    const e = map.get(r.country_code) ?? { country: r.client_country_snapshot, code: r.country_code, total: 0n, count: 0 };
    e.total += decimalStringToMinor(r.grand_total);
    e.count += 1;
    map.set(r.country_code, e);
  }
  return [...map.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}

export function totals(rows: ReportRow[], currency: string) {
  let total = 0n, paid = 0n, tax = 0n, taxable = 0n, count = 0;
  for (const r of rows) {
    if (r.currency_code !== currency) continue;
    total += decimalStringToMinor(r.grand_total);
    paid += decimalStringToMinor(r.paid_amount);
    if (r.country_code === 'IN') {
      tax += decimalStringToMinor(r.tax_amount);
      taxable += decimalStringToMinor(r.taxable_value);
    }
    count++;
  }
  return { total, paid, outstanding: total - paid, tax, taxable, count };
}

/** minor units → major-unit number, for chart axes only (never for money math). */
export const toChart = (v: bigint) => Number(v) / 100;
