/**
 * Decimal-safe money helpers.
 *
 * All amounts are handled as BigInt "minor units" (paise / cents, 2 dp).
 * Quantities use 3 decimal places. Nothing here touches floating point,
 * so results match PostgreSQL numeric arithmetic exactly.
 */

export const MONEY_SCALE = 2;
export const QTY_SCALE = 3;

const DECIMAL_RE = /^\d+(\.\d+)?$/;

/**
 * Parse a user-entered decimal string into a scaled BigInt.
 * Returns null for empty/invalid input or too many decimal places.
 * "12.5" with scale 2 → 1250n
 */
export function parseScaled(input: string | number | null | undefined, scale: number): bigint | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/,/g, '');
  if (raw === '' || !DECIMAL_RE.test(raw)) return null;
  const [whole = '0', frac = ''] = raw.split('.');
  if (frac.length > scale) return null;
  const padded = frac.padEnd(scale, '0');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded || '0');
}

/** Number of decimal places in a decimal string ("1.250" → 3). */
export function decimalPlaces(input: string): number {
  const s = input.trim();
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

/** Integer division rounding half away from zero (matches PostgreSQL round()). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (2n * d);
  return negative ? -q : q;
}

/** 1250n → "12.50" */
export function minorToDecimalString(minor: bigint, scale = MONEY_SCALE): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole.toString()}${scale > 0 ? `.${frac}` : ''}`;
}

/** Parse a database numeric string such as "1180.00" into minor units. */
export function decimalStringToMinor(value: string | number): bigint {
  const parsed = parseScaled(String(value), MONEY_SCALE);
  if (parsed === null) {
    // Values from the DB always have ≤2 dp; tolerate negatives defensively.
    const s = String(value).trim();
    if (s.startsWith('-')) {
      const p = parseScaled(s.slice(1), MONEY_SCALE);
      if (p !== null) return -p;
    }
    throw new RangeError(`Invalid money value: ${value}`);
  }
  return parsed;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Format minor units as currency, e.g. 118000n, "INR" → "₹1,180.00". */
export function formatMoney(minor: bigint, currency: string): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const key = `${locale}|${currency}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    formatters.set(key, fmt);
  }
  // Format the integer part via BigInt-safe string to avoid float drift.
  const str = minorToDecimalString(minor);
  // Intl accepts decimal strings in modern runtimes; fall back to Number.
  try {
    return fmt.format(str as unknown as number);
  } catch {
    return fmt.format(Number(str));
  }
}

/** Convenience for values coming back from the database as strings. */
export function formatDbMoney(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '—';
  return formatMoney(decimalStringToMinor(value), currency);
}

/** "2.500" (scale 3) → "2.5" for display. */
export function formatQuantity(value: string | number): string {
  const s = String(value);
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}
