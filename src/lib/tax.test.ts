import { describe, expect, it } from 'vitest';
import { calculateInvoice, lineTotalMinor, outstandingMinor, paidAmountFromCheckbox, currencyForCountry } from './tax';
import { divRoundHalfUp, formatMoney, minorToDecimalString, parseScaled } from './money';

const s = (n: bigint) => minorToDecimalString(n);

describe('money primitives', () => {
  it('parses decimals without floating point', () => {
    expect(parseScaled('0.1', 2)).toBe(10n);
    expect(parseScaled('1,180', 2)).toBe(118000n);
    expect(parseScaled('12.345', 2)).toBeNull(); // too many decimals
    expect(parseScaled('-1', 2)).toBeNull();
    expect(parseScaled('abc', 2)).toBeNull();
    expect(parseScaled('', 2)).toBeNull();
  });

  it('rounds half away from zero like PostgreSQL', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
  });

  it('formats INR and USD', () => {
    expect(formatMoney(118000n, 'INR')).toBe('₹1,180.00');
    expect(formatMoney(10000000n, 'INR')).toBe('₹1,00,000.00');
    expect(formatMoney(100000n, 'USD')).toBe('$1,000.00');
  });
});

describe('Indian invoice — tax-inclusive 18%', () => {
  it('₹1,180 → taxable ₹1,000, tax ₹180, grand total ₹1,180 (no tax added on top)', () => {
    const t = calculateInvoice('IN', [{ quantity: '1', unitPrice: '1180' }]);
    expect(s(t.subtotal)).toBe('1180.00');
    expect(s(t.taxableValue)).toBe('1000.00');
    expect(s(t.taxAmount)).toBe('180.00');
    expect(s(t.grandTotal)).toBe('1180.00');
    expect(t.taxRateBp).toBe(1800n);
  });

  it('taxable + tax always reconciles to the subtotal', () => {
    for (const price of ['1', '99.99', '1000', '12345.67', '0.01', '777.77']) {
      const t = calculateInvoice('IN', [{ quantity: '1', unitPrice: price }]);
      expect(t.taxableValue + t.taxAmount).toBe(t.subtotal);
    }
  });
});

describe('International invoice — 0%', () => {
  it('$1,000 → subtotal $1,000, tax $0, total $1,000', () => {
    const t = calculateInvoice('US', [{ quantity: '1', unitPrice: '1000' }]);
    expect(s(t.subtotal)).toBe('1000.00');
    expect(s(t.taxAmount)).toBe('0.00');
    expect(s(t.grandTotal)).toBe('1000.00');
    expect(t.split).toBeNull();
    expect(t.isIndia).toBe(false);
  });
});

describe('multiple items and decimals', () => {
  it('sums several lines with decimal quantities and prices (matches DB test)', () => {
    const t = calculateInvoice('IN', [
      { quantity: '2.5', unitPrice: '99.99' },
      { quantity: '3', unitPrice: '0.10' },
      { quantity: '0.333', unitPrice: '10' },
    ]);
    expect(t.lineTotals.map((v) => s(v!))).toEqual(['249.98', '0.30', '3.33']);
    expect(s(t.subtotal)).toBe('253.61');
    expect(s(t.taxableValue)).toBe('214.92');
    expect(s(t.taxAmount)).toBe('38.69');
  });

  it('0.1 × 3 is exactly 0.30 (no float error)', () => {
    expect(lineTotalMinor('3', '0.1')).toBe(30n);
  });

  it('rejects zero/negative quantity and negative price', () => {
    expect(lineTotalMinor('0', '10')).toBeNull();
    expect(lineTotalMinor('-1', '10')).toBeNull();
    expect(lineTotalMinor('1', '-10')).toBeNull();
    expect(lineTotalMinor('1', '0')).toBe(0n);
  });

  it('flags incomplete invoices while lines are still being typed', () => {
    const t = calculateInvoice('US', [{ quantity: '1', unitPrice: '' }, { quantity: '2', unitPrice: '5' }]);
    expect(t.complete).toBe(false);
    expect(s(t.subtotal)).toBe('10.00');
  });
});

describe('country change recalculates tax', () => {
  it('same items: India → 18% inclusive, then US → 0%', () => {
    const items = [{ quantity: '1', unitPrice: '1180' }];
    expect(s(calculateInvoice('IN', items).taxAmount)).toBe('180.00');
    expect(s(calculateInvoice('US', items).taxAmount)).toBe('0.00');
    expect(s(calculateInvoice('US', items).grandTotal)).toBe('1180.00');
  });
});

describe('GST split', () => {
  it('CGST + SGST halves reconcile', () => {
    const t = calculateInvoice('IN', [{ quantity: '1', unitPrice: '1000' }], { india_tax_rate: 18, india_split_mode: 'cgst_sgst' });
    expect(t.split?.type).toBe('cgst_sgst');
    if (t.split?.type === 'cgst_sgst') {
      expect(t.split.cgst + t.split.sgst).toBe(t.taxAmount);
      expect(t.split.halfRateBp).toBe(900n);
    }
  });

  it('auto mode: same state as supplier → CGST/SGST, otherwise IGST', () => {
    const cfg = { india_tax_rate: 18, india_split_mode: 'auto_by_state' as const, supplier_state: 'Madhya Pradesh' };
    expect(calculateInvoice('IN', [{ quantity: '1', unitPrice: '100' }], cfg, 'Madhya Pradesh').split?.type).toBe('cgst_sgst');
    expect(calculateInvoice('IN', [{ quantity: '1', unitPrice: '100' }], cfg, 'Goa').split?.type).toBe('igst');
  });
});

describe('payment status', () => {
  it('checked = fully paid, outstanding 0; unchecked = outstanding equals total', () => {
    expect(paidAmountFromCheckbox(true, 118000n)).toBe(118000n);
    expect(outstandingMinor(118000n, paidAmountFromCheckbox(true, 118000n))).toBe(0n);
    expect(outstandingMinor(118000n, paidAmountFromCheckbox(false, 118000n))).toBe(118000n);
    expect(outstandingMinor(100n, 200n)).toBe(0n);
  });

  it('currency by country', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('GB')).toBe('USD');
    expect(currencyForCountry('GB', 'GBP')).toBe('GBP');
  });
});
