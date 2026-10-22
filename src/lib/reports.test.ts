import { describe, expect, it } from 'vitest';
import { byCountry, byMonth, countByMonth, monthRange, totals } from './reports';
import type { ReportRow } from './api';

const row = (p: Partial<ReportRow>): ReportRow => ({
  invoice_date: '2026-01-15', country_code: 'IN', client_country_snapshot: 'India', currency_code: 'INR',
  grand_total: '1180', paid_amount: '0', tax_amount: '180', taxable_value: '1000', ...p,
});

describe('reports aggregation', () => {
  const rows = [
    row({}),
    row({ invoice_date: '2026-03-02', paid_amount: '1180' }),
    row({ country_code: 'US', client_country_snapshot: 'United States', currency_code: 'USD', grand_total: '1000', tax_amount: '0', taxable_value: '1000' }),
  ];

  it('fills empty months with zero', () => {
    const months = monthRange('2026-01-01', '2026-03-31');
    expect(months).toEqual(['2026-01', '2026-02', '2026-03']);
    const m = byMonth(rows, 'INR', months);
    expect(m.map((b) => b.total)).toEqual([118000n, 0n, 118000n]);
  });

  it('never mixes currencies', () => {
    const inr = totals(rows, 'INR');
    const usd = totals(rows, 'USD');
    expect(inr.total).toBe(236000n);
    expect(inr.paid).toBe(118000n);
    expect(inr.outstanding).toBe(118000n);
    expect(inr.tax).toBe(36000n);
    expect(usd.total).toBe(100000n);
    expect(usd.tax).toBe(0n);
  });

  it('counts across currencies and groups by country', () => {
    expect(countByMonth(rows, monthRange('2026-01-01', '2026-03-01')).map((c) => c.count)).toEqual([2, 0, 1]);
    expect(byCountry(rows, 'USD')[0]).toMatchObject({ code: 'US', count: 1, total: 100000n });
  });
});
