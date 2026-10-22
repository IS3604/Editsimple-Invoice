import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

// ---- mock Supabase + API layer -------------------------------------------
const state: { session: unknown; role: 'admin' | 'staff' | 'pending' } = { session: null, role: 'admin' };

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
    },
  },
}));

const settings = {
  id: 1, company_name: 'EditSimple Editing Services Private Limited', company_email: 'a@example.test',
  company_address: 'Addr', gstin: '00AAAAA0000A0Z0',
  indian_payment_details: { lines: [{ label: 'IFSC Code', value: 'TEST0000000' }] },
  international_payment_details: { lines: [{ label: 'Routing Number', value: '000000000' }] },
  default_currency: 'USD', tax_configuration: { india_tax_rate: 18, india_split_mode: 'none' },
  pdf_footer_text: 'Thanks', payment_terms: null, default_invoice_date: 'today', updated_at: '',
};

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return {
    ...actual,
    getMyProfile: async (id: string) => ({ id, email: 'user@example.test', full_name: 'Test User', role: state.role, created_at: '' }),
    fetchSettings: async () => settings,
    listInvoices: async () => ({ rows: [], total: 0 }),
    dashboardSummary: async () => ({ invoice_count: 0, draft_count: 0, cancelled_count: 0, by_currency: [] }),
    listClients: async () => ({ rows: [], total: 0 }),
    previewInvoiceNumber: async (c: string) => `${c}0001`,
    saveInvoice: vi.fn(async () => 'new-id'),
    findSimilarClients: async () => [],
  };
});

const { routes } = await import('@/App');

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

async function option(label: string) {
  const all = await screen.findAllByRole('option');
  const el = all.find((o) => o.querySelector('span')?.textContent === label);
  if (!el) throw new Error(`option ${label} not found`);
  return el;
}

beforeEach(() => { state.session = null; state.role = 'admin'; });

describe('authentication-protected routes', () => {
  it('redirects anonymous users to the login page', async () => {
    const router = renderAt('/invoices');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows "access not granted" for signed-in users without a role', async () => {
    state.session = { user: { id: 'u1', email: 'p@example.test' } };
    state.role = 'pending';
    renderAt('/');
    expect(await screen.findByText(/Access not yet granted/)).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('lets authorised users into the dashboard and hides Settings from staff', async () => {
    state.session = { user: { id: 'u1', email: 's@example.test' } };
    state.role = 'staff';
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /Settings/ })).toHaveLength(0);
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
  });

  it('blocks staff from the Settings page itself', async () => {
    state.session = { user: { id: 'u1', email: 's@example.test' } };
    state.role = 'staff';
    renderAt('/settings');
    expect(await screen.findByText('Administrators only')).toBeInTheDocument();
  });
});

describe('create invoice form', () => {
  it('India shows State + 18% inclusive tax; switching country hides State, zeroes tax and keeps items', async () => {
    state.session = { user: { id: 'u1', email: 'a@example.test' } };
    const user = userEvent.setup();
    renderAt('/invoices/new');
    await screen.findByRole('heading', { name: 'Create Invoice' });

    // choose India
    await user.click(screen.getByRole('combobox', { name: /Client Country/ }));
    await user.type(screen.getByPlaceholderText('Search countries…'), 'India');
    await user.click(await option('India'));

    expect(screen.getByLabelText(/^State/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('0.00'), '1180');
    const totals = (await screen.findAllByText('Grand Total'))[0]!.closest('dl')!;
    await waitFor(() => expect(within(totals).getByText('₹1,000.00')).toBeInTheDocument());
    expect(within(totals).getByText('₹180.00')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('IN0001')).toBeInTheDocument();
    expect(screen.getAllByText(/IFSC Code/).length).toBeGreaterThan(0);

    // switch to United States
    await user.click(screen.getByRole('combobox', { name: /Client Country/ }));
    await user.type(screen.getByPlaceholderText('Search countries…'), 'United States');
    await user.click(await option('United States'));

    expect(screen.queryByLabelText(/^State/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toHaveValue('1180');
    await waitFor(() => expect(within(totals).getByText('Tax (0%)')).toBeInTheDocument());
    expect(within(totals).getAllByText('$1,180.00').length).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue('US0001')).toBeInTheDocument();
    expect(screen.getAllByText(/Routing Number/).length).toBeGreaterThan(0);
  });

  it('blocks saving and flags fields when required data is missing', async () => {
    state.session = { user: { id: 'u1', email: 'a@example.test' } };
    const api = await import('@/lib/api');
    const user = userEvent.setup();
    renderAt('/invoices/new');
    await screen.findByRole('heading', { name: 'Create Invoice' });
    await user.click(screen.getByRole('button', { name: /Save Invoice/ }));
    expect(await screen.findByText('Client name is required.')).toBeInTheDocument();
    expect(screen.getByText('Client country is required.')).toBeInTheDocument();
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
    expect(api.saveInvoice).not.toHaveBeenCalled();
  });
});
