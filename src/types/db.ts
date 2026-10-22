export type AppRole = 'admin' | 'staff' | 'pending';
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  country_code: string;
  country_name: string;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentLine { label: string; value: string }
export interface PaymentDetails { lines?: PaymentLine[] }

export interface CompanySettings {
  id: number;
  company_name: string;
  company_email: string;
  company_address: string;
  gstin: string | null;
  indian_payment_details: PaymentDetails;
  international_payment_details: PaymentDetails;
  default_currency: string;
  tax_configuration: {
    india_tax_rate: number | string;
    india_split_mode: 'none' | 'igst' | 'cgst_sgst' | 'auto_by_state';
    supplier_state?: string;
  };
  pdf_footer_text: string;
  payment_terms: string | null;
  default_invoice_date: 'today' | 'blank';
  updated_at: string;
}

export interface CompanySnapshot {
  company_name: string;
  company_email: string;
  company_address: string;
  gstin: string | null;
  pdf_footer_text: string | null;
  payment_terms: string | null;
}

export interface PaymentSnapshot {
  region: 'IN' | 'INTL';
  details: PaymentDetails;
}

export type DbTaxSplit =
  | { type: 'igst'; igst_rate: number; igst: number | string }
  | { type: 'cgst_sgst'; cgst_rate: number; sgst_rate: number; cgst: number | string; sgst: number | string }
  | null;

/** numeric columns arrive from PostgREST as numbers; we normalise to strings */
export interface Invoice {
  id: string;
  invoice_number: string;
  country_code: string;
  invoice_date: string;
  client_id: string | null;
  client_name_snapshot: string;
  client_phone_snapshot: string | null;
  client_address_snapshot: string | null;
  client_country_snapshot: string;
  client_state_snapshot: string | null;
  currency_code: string;
  subtotal: string;
  taxable_value: string;
  tax_rate: string;
  tax_amount: string;
  tax_split: DbTaxSplit;
  grand_total: string;
  paid_amount: string;
  payment_status: PaymentStatus;
  invoice_status: InvoiceStatus;
  notes: string | null;
  company_snapshot: CompanySnapshot;
  payment_snapshot: PaymentSnapshot;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  sort_order: number;
}

export interface InvoiceWithItems extends Invoice { invoice_items: InvoiceItem[] }

export interface DashboardSummary {
  invoice_count: number;
  draft_count: number;
  cancelled_count: number;
  by_currency: {
    currency_code: string;
    invoice_count: number;
    total_value: number | string;
    total_paid: number | string;
    total_outstanding: number | string;
  }[];
}
