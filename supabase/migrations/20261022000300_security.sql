-- =====================================================================
-- EditSimple Invoices — Row Level Security and privileges
--
-- Model:
--   * anon (not signed in)       : no access to anything
--   * authenticated + 'pending'  : can read only their own profile
--   * 'staff'                    : read/write clients, read invoices & settings,
--                                  write invoices ONLY through RPCs
--   * 'admin'                    : staff rights + settings + user roles
-- Invoices and items have NO insert/update/delete policies: every write
-- goes through save_invoice / set_invoice_paid / cancel_invoice, which
-- re-validate and recalculate totals on the server.
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.company_settings  enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;

-- ---- table privileges -------------------------------------------------
revoke all on public.profiles, public.clients, public.company_settings,
              public.invoice_sequences, public.invoices, public.invoice_items
  from anon, authenticated, public;

grant select on public.profiles, public.clients, public.company_settings,
                public.invoices, public.invoice_items to authenticated;
grant insert, update, delete on public.clients to authenticated;
grant update (company_name, company_email, company_address, gstin,
              indian_payment_details, international_payment_details,
              default_currency, tax_configuration, pdf_footer_text,
              payment_terms, default_invoice_date)
  on public.company_settings to authenticated;
grant update (full_name, role) on public.profiles to authenticated;

-- ---- profiles ---------------------------------------------------------
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---- clients ----------------------------------------------------------
create policy clients_select on public.clients
  for select to authenticated using ((select public.is_authorized()));
create policy clients_insert on public.clients
  for insert to authenticated with check ((select public.is_authorized()));
create policy clients_update on public.clients
  for update to authenticated
  using ((select public.is_authorized())) with check ((select public.is_authorized()));
create policy clients_delete_admin on public.clients
  for delete to authenticated using ((select public.is_admin()));

-- ---- company settings -------------------------------------------------
create policy settings_select on public.company_settings
  for select to authenticated using ((select public.is_authorized()));
create policy settings_update_admin on public.company_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- invoices / items (read only through RLS) --------------------------
create policy invoices_select on public.invoices
  for select to authenticated using ((select public.is_authorized()));
create policy invoice_items_select on public.invoice_items
  for select to authenticated using ((select public.is_authorized()));

-- invoice_sequences: RLS enabled, no policies => only security-definer
-- functions can touch it.

-- ---- function privileges ---------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_app_role()                      to authenticated;
grant execute on function public.is_admin()                              to authenticated;
grant execute on function public.is_authorized()                         to authenticated;
grant execute on function public.preview_invoice_number(text)            to authenticated;
grant execute on function public.save_invoice(uuid, jsonb, boolean)      to authenticated;
grant execute on function public.set_invoice_paid(uuid, boolean)         to authenticated;
grant execute on function public.cancel_invoice(uuid, text)              to authenticated;
grant execute on function public.dashboard_summary()                     to authenticated;
grant execute on function public.compute_invoice_tax(text, numeric, text, jsonb) to authenticated;
-- allocate_invoice_number and assert_authorized stay private: numbers can
-- only be consumed by save_invoice.

-- Functions created later must not be executable by anon by default.
alter default privileges in schema public revoke execute on functions from public, anon;
