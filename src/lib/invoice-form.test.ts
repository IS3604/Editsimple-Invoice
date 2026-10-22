import { describe, expect, it } from 'vitest';
import { applyCountryChange, emptyInvoiceForm, toSavePayload, validateInvoiceForm, type InvoiceFormValues } from './invoice-form';
import { DEFAULT_TAX_CONFIG } from './tax';

function filled(overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues {
  const f = emptyInvoiceForm();
  return {
    ...f,
    client: { name: 'Acme Studio', phone: '', address: '', countryCode: 'IN', countryName: 'India', state: 'Goa' },
    items: [{ key: 'a', description: 'Edit', quantity: '1', unitPrice: '1180' }],
    ...overrides,
  };
}

describe('validation', () => {
  it('a complete Indian invoice is valid', () => {
    expect(validateInvoiceForm(filled())).toEqual({});
  });

  it('State is required for India', () => {
    const v = filled();
    v.client.state = '';
    expect(validateInvoiceForm(v)['client.state']).toMatch(/State is required/);
  });

  it('State is not required elsewhere', () => {
    const v = applyCountryChange(filled(), 'US', 'United States');
    expect(validateInvoiceForm(v)['client.state']).toBeUndefined();
  });

  it('requires name, country, date and at least one item', () => {
    const v = emptyInvoiceForm();
    v.items = [];
    v.invoiceDate = '';
    const e = validateInvoiceForm(v);
    expect(e['client.name']).toBeDefined();
    expect(e['client.countryCode']).toBeDefined();
    expect(e.invoiceDate).toBeDefined();
    expect(e.items).toBeDefined();
  });

  it('item rules: description, quantity > 0, price ≥ 0, decimal places', () => {
    const v = filled({
      items: [
        { key: '1', description: '', quantity: '0', unitPrice: '-5' },
        { key: '2', description: 'ok', quantity: '1.2345', unitPrice: '1.001' },
        { key: '3', description: 'ok', quantity: 'abc', unitPrice: '' },
      ],
    });
    const e = validateInvoiceForm(v);
    expect(e['items.0.description']).toBeDefined();
    expect(e['items.0.quantity']).toMatch(/greater than zero/);
    expect(e['items.0.unitPrice']).toMatch(/negative/);
    expect(e['items.1.quantity']).toMatch(/3 decimal/);
    expect(e['items.1.unitPrice']).toMatch(/2 decimal/);
    expect(e['items.2.quantity']).toMatch(/valid number/);
    expect(e['items.2.unitPrice']).toMatch(/required/);
  });

  it('rejects impossible dates', () => {
    expect(validateInvoiceForm(filled({ invoiceDate: '2026-02-30' })).invoiceDate).toBeDefined();
  });
});

describe('country change', () => {
  it('leaving India clears the state but keeps client and items', () => {
    const before = filled();
    const after = applyCountryChange(before, 'US', 'United States');
    expect(after.client.state).toBe('');
    expect(after.client.name).toBe('Acme Studio');
    expect(after.items).toEqual(before.items);
  });

  it('switching to India keeps any state already chosen', () => {
    const v = applyCountryChange(filled(), 'IN', 'India');
    expect(v.client.state).toBe('Goa');
  });
});

describe('save payload', () => {
  it('sends strings (not floats), the expected total, and nulls state outside India', () => {
    const v = applyCountryChange(filled({ items: [{ key: 'x', description: ' Edit ', quantity: '2', unitPrice: '1,000.50' }] }), 'US', 'United States');
    const p = toSavePayload(v, DEFAULT_TAX_CONFIG);
    expect(p.client.state).toBeNull();
    expect(p.items[0]).toEqual({ description: 'Edit', quantity: '2', unit_price: '1000.50' });
    expect(p.expected_grand_total).toBe('2001.00');
  });

  it('Indian payload total equals the inclusive gross', () => {
    expect(toSavePayload(filled(), DEFAULT_TAX_CONFIG).expected_grand_total).toBe('1180.00');
  });
});
