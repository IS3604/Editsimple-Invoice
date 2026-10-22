-- =====================================================================
-- EditSimple Invoices — trusted server-side functions
-- All financial calculations are (re)done here. The browser's numbers are
-- only used as a cross-check (expected_grand_total).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'pending');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_authorized()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'));
$$;

create or replace function public.assert_authorized()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_authorized() then
    raise exception 'You are not authorized to perform this action'
      using errcode = '42501', hint = 'NOT_AUTHORIZED';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- New auth users get a 'pending' profile (no data access).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Never allow the system to lose its last administrator.
create or replace function public.tg_profiles_keep_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id) then
    raise exception 'At least one administrator must remain'
      using errcode = 'P0001', hint = 'LAST_ADMIN';
  end if;
  return new;
end $$;

create trigger profiles_keep_admin before update of role on public.profiles
  for each row execute function public.tg_profiles_keep_admin();

-- company_settings.updated_by is always the caller.
create or replace function public.tg_settings_updated_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger company_settings_updated_by before update on public.company_settings
  for each row execute function public.tg_settings_updated_by();

-- ---------------------------------------------------------------------
-- Invoice numbering
-- ---------------------------------------------------------------------
-- Atomically allocates the next number for a country. The row-level lock
-- taken by INSERT ... ON CONFLICT DO UPDATE serialises concurrent callers,
-- so two transactions can never receive the same value. Numbers are never
-- returned to the pool (cancelled invoices keep theirs).
create or replace function public.allocate_invoice_number(p_country_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(p_country_code));
  v_next integer;
begin
  if v_code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country code' using errcode = 'P0001', hint = 'INVALID_COUNTRY';
  end if;
  insert into public.invoice_sequences as s (country_code, last_value)
  values (v_code, 1)
  on conflict (country_code)
  do update set last_value = s.last_value + 1, updated_at = now()
  returning s.last_value into v_next;
  return v_code || lpad(v_next::text, 4, '0');
end $$;

-- Read-only preview of the next number (NOT reserved; the real number is
-- assigned on first save and may differ if someone else saves first).
create or replace function public.preview_invoice_number(p_country_code text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(p_country_code));
  v_last integer;
begin
  perform public.assert_authorized();
  if v_code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid country code' using errcode = 'P0001', hint = 'INVALID_COUNTRY';
  end if;
  select last_value into v_last from public.invoice_sequences where country_code = v_code;
  return v_code || lpad((coalesce(v_last, 0) + 1)::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Tax calculation (single source of truth on the server)
-- Prices are tax-inclusive for India: taxable = gross / (1 + rate/100).
-- ---------------------------------------------------------------------
create or replace function public.compute_invoice_tax(
  p_country_code text, p_gross numeric, p_state text, p_tax_config jsonb
)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_rate     numeric := 0;
  v_taxable  numeric;
  v_tax      numeric;
  v_mode     text;
  v_half     numeric;
  v_split    jsonb := null;
begin
  if p_country_code = 'IN' then
    v_rate := coalesce((p_tax_config ->> 'india_tax_rate')::numeric, 18);
  end if;

  v_taxable := round(p_gross * 100 / (100 + v_rate), 2);
  v_tax := p_gross - v_taxable;

  if p_country_code = 'IN' and v_rate > 0 then
    v_mode := coalesce(p_tax_config ->> 'india_split_mode', 'none');
    if v_mode = 'auto_by_state' then
      v_mode := case
        when lower(btrim(coalesce(p_state, ''))) = lower(btrim(coalesce(p_tax_config ->> 'supplier_state', '')))
          then 'cgst_sgst' else 'igst' end;
    end if;
    if v_mode = 'igst' then
      v_split := jsonb_build_object('type', 'igst', 'igst_rate', v_rate, 'igst', v_tax);
    elsif v_mode = 'cgst_sgst' then
      v_half := round(v_tax / 2, 2);
      v_split := jsonb_build_object(
        'type', 'cgst_sgst',
        'cgst_rate', v_rate / 2, 'sgst_rate', v_rate / 2,
        'cgst', v_half, 'sgst', v_tax - v_half);
    end if;
  end if;

  return jsonb_build_object(
    'tax_rate', v_rate, 'subtotal', p_gross, 'taxable_value', v_taxable,
    'tax_amount', v_tax, 'grand_total', p_gross, 'tax_split', v_split);
end $$;

-- ---------------------------------------------------------------------
-- Create or update an invoice (and its items) in ONE transaction.
--
-- p_invoice_id : null to create, otherwise the invoice to update
-- p_payload    : {
--    client_id?, save_client?: bool,
--    client: {name, phone?, address?, country_code, country_name, state?},
--    invoice_date: 'YYYY-MM-DD', notes?, paid?: bool,
--    items: [{description, quantity, unit_price}],
--    expected_grand_total?: number   -- browser's total, verified here
-- }
-- p_issue      : true = issue the invoice, false = keep as draft
-- Returns the invoice id.
-- ---------------------------------------------------------------------
create or replace function public.save_invoice(
  p_invoice_id uuid, p_payload jsonb, p_issue boolean default true
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_client        jsonb := coalesce(p_payload -> 'client', '{}'::jsonb);
  v_name          text := btrim(coalesce(v_client ->> 'name', ''));
  v_phone         text := nullif(btrim(coalesce(v_client ->> 'phone', '')), '');
  v_address       text := nullif(btrim(coalesce(v_client ->> 'address', '')), '');
  v_country       text := upper(btrim(coalesce(v_client ->> 'country_code', '')));
  v_country_name  text := btrim(coalesce(v_client ->> 'country_name', ''));
  v_state         text := nullif(btrim(coalesce(v_client ->> 'state', '')), '');
  v_client_id     uuid := nullif(p_payload ->> 'client_id', '')::uuid;
  v_date          date;
  v_notes         text := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_items         jsonb := p_payload -> 'items';
  v_item          jsonb;
  v_qty           numeric;
  v_price         numeric;
  v_desc          text;
  v_gross         numeric := 0;
  v_tax           jsonb;
  v_settings      public.company_settings%rowtype;
  v_existing      public.invoices%rowtype;
  v_id            uuid;
  v_number        text;
  v_status        text;
  v_paid_amount   numeric;
  v_refresh_snap  boolean;
  v_company_snap  jsonb;
  v_payment_snap  jsonb;
  v_currency      text;
  v_idx           integer := 0;
  v_attempt       integer := 0;
begin
  perform public.assert_authorized();

  -- ---- validate client -------------------------------------------------
  if v_name = '' then
    raise exception 'Client name is required' using errcode = 'P0001', hint = 'VALIDATION:client.name';
  end if;
  if length(v_name) > 200 then
    raise exception 'Client name is too long' using errcode = 'P0001', hint = 'VALIDATION:client.name';
  end if;
  if v_country !~ '^[A-Z]{2}$' or v_country_name = '' then
    raise exception 'Client country is required' using errcode = 'P0001', hint = 'VALIDATION:client.country_code';
  end if;
  if v_country = 'IN' then
    if v_state is null then
      raise exception 'State is required for Indian clients' using errcode = 'P0001', hint = 'VALIDATION:client.state';
    end if;
  else
    v_state := null;
  end if;

  -- ---- validate date ---------------------------------------------------
  begin
    v_date := (p_payload ->> 'invoice_date')::date;
  exception when others then
    raise exception 'Invoice date is invalid' using errcode = 'P0001', hint = 'VALIDATION:invoice_date';
  end;
  if v_date is null then
    raise exception 'Invoice date is required' using errcode = 'P0001', hint = 'VALIDATION:invoice_date';
  end if;

  -- ---- validate items --------------------------------------------------
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'At least one invoice item is required' using errcode = 'P0001', hint = 'VALIDATION:items';
  end if;
  if jsonb_array_length(v_items) > 200 then
    raise exception 'An invoice can have at most 200 items' using errcode = 'P0001', hint = 'VALIDATION:items';
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_desc := btrim(coalesce(v_item ->> 'description', ''));
    if v_desc = '' then
      raise exception 'Item % description is required', v_idx + 1
        using errcode = 'P0001', hint = 'VALIDATION:items.' || v_idx || '.description';
    end if;
    begin
      v_qty := (v_item ->> 'quantity')::numeric;
      v_price := (v_item ->> 'unit_price')::numeric;
    exception when others then
      raise exception 'Item % has an invalid number', v_idx + 1
        using errcode = 'P0001', hint = 'VALIDATION:items.' || v_idx;
    end;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 3) or v_qty >= 1e9 then
      raise exception 'Item % quantity must be greater than zero (max 3 decimals)', v_idx + 1
        using errcode = 'P0001', hint = 'VALIDATION:items.' || v_idx || '.quantity';
    end if;
    if v_price is null or v_price < 0 or v_price <> round(v_price, 2) or v_price >= 1e12 then
      raise exception 'Item % unit price must be zero or more (max 2 decimals)', v_idx + 1
        using errcode = 'P0001', hint = 'VALIDATION:items.' || v_idx || '.unit_price';
    end if;
    v_gross := v_gross + round(v_qty * v_price, 2);
    v_idx := v_idx + 1;
  end loop;

  if v_gross >= 1e12 then
    raise exception 'Invoice total is too large' using errcode = 'P0001', hint = 'VALIDATION:items';
  end if;

  -- ---- settings + tax --------------------------------------------------
  select * into v_settings from public.company_settings where id = 1;
  if not found then
    raise exception 'Company settings are missing' using errcode = 'P0001', hint = 'SETTINGS_MISSING';
  end if;

  v_tax := public.compute_invoice_tax(v_country, v_gross, v_state, v_settings.tax_configuration);

  if p_payload ? 'expected_grand_total'
     and (p_payload ->> 'expected_grand_total')::numeric <> (v_tax ->> 'grand_total')::numeric then
    raise exception 'Totals changed during save (expected %, calculated %). Please review and save again.',
      p_payload ->> 'expected_grand_total', v_tax ->> 'grand_total'
      using errcode = 'P0001', hint = 'TOTAL_MISMATCH';
  end if;

  -- ---- client record ---------------------------------------------------
  if v_client_id is not null then
    if not exists (select 1 from public.clients where id = v_client_id) then
      raise exception 'Selected client no longer exists' using errcode = 'P0001', hint = 'CLIENT_NOT_FOUND';
    end if;
  elsif coalesce((p_payload ->> 'save_client')::boolean, false) then
    insert into public.clients (name, phone, address, country_code, country_name, state, created_by)
    values (v_name, v_phone, v_address, v_country, v_country_name, v_state, auth.uid())
    returning id into v_client_id;
  end if;

  -- ---- existing invoice? ----------------------------------------------
  if p_invoice_id is not null then
    select * into v_existing from public.invoices where id = p_invoice_id for update;
    if not found then
      raise exception 'Invoice not found' using errcode = 'P0001', hint = 'INVOICE_NOT_FOUND';
    end if;
    if v_existing.invoice_status = 'cancelled' then
      raise exception 'Cancelled invoices cannot be edited' using errcode = 'P0001', hint = 'INVOICE_CANCELLED';
    end if;
    if v_existing.country_code <> v_country then
      raise exception 'The country of a saved invoice (%) cannot be changed because the invoice number depends on it',
        v_existing.country_code using errcode = 'P0001', hint = 'INVOICE_COUNTRY_IMMUTABLE';
    end if;
  end if;

  v_status := case
    when v_existing.invoice_status = 'issued' then 'issued'
    when p_issue then 'issued'
    else 'draft' end;

  -- Snapshots refresh while the invoice is a draft (or is being issued now);
  -- once issued they are frozen so historical PDFs never change.
  v_refresh_snap := p_invoice_id is null or v_existing.invoice_status = 'draft';

  if v_refresh_snap then
    v_company_snap := jsonb_build_object(
      'company_name', v_settings.company_name,
      'company_email', v_settings.company_email,
      'company_address', v_settings.company_address,
      'gstin', v_settings.gstin,
      'pdf_footer_text', v_settings.pdf_footer_text,
      'payment_terms', v_settings.payment_terms);
    v_payment_snap := case when v_country = 'IN'
      then jsonb_build_object('region', 'IN', 'details', v_settings.indian_payment_details)
      else jsonb_build_object('region', 'INTL', 'details', v_settings.international_payment_details) end;
    v_currency := case when v_country = 'IN' then 'INR' else v_settings.default_currency end;
  else
    v_company_snap := v_existing.company_snapshot;
    v_payment_snap := v_existing.payment_snapshot;
    v_currency := v_existing.currency_code;
  end if;

  -- Paid checkbox: checked = fully paid, unchecked = nothing paid.
  if p_payload ? 'paid' then
    v_paid_amount := case when (p_payload ->> 'paid')::boolean then (v_tax ->> 'grand_total')::numeric else 0 end;
  else
    v_paid_amount := least(coalesce(v_existing.paid_amount, 0), (v_tax ->> 'grand_total')::numeric);
  end if;

  if p_invoice_id is null then
    -- Allocate a number; retry if it somehow collides with an existing one
    -- (e.g. a manually inserted row). Allocation happens outside the inner
    -- exception block so a failed insert does not roll the counter back.
    loop
      v_attempt := v_attempt + 1;
      v_number := public.allocate_invoice_number(v_country);
      begin
        insert into public.invoices (
          invoice_number, country_code, invoice_date, client_id,
          client_name_snapshot, client_phone_snapshot, client_address_snapshot,
          client_country_snapshot, client_state_snapshot,
          currency_code, subtotal, taxable_value, tax_rate, tax_amount, tax_split, grand_total,
          paid_amount, invoice_status, notes, company_snapshot, payment_snapshot,
          issued_at, created_by)
        values (
          v_number, v_country, v_date, v_client_id,
          v_name, v_phone, v_address, v_country_name, v_state,
          v_currency, (v_tax ->> 'subtotal')::numeric, (v_tax ->> 'taxable_value')::numeric,
          (v_tax ->> 'tax_rate')::numeric, (v_tax ->> 'tax_amount')::numeric, v_tax -> 'tax_split',
          (v_tax ->> 'grand_total')::numeric, v_paid_amount, v_status, v_notes,
          v_company_snap, v_payment_snap,
          case when v_status = 'issued' then now() end, auth.uid())
        returning id into v_id;
        exit;
      exception when unique_violation then
        if v_attempt >= 5 then
          raise exception 'Could not allocate a unique invoice number, please retry'
            using errcode = 'P0001', hint = 'INVOICE_NUMBER_CONFLICT';
        end if;
      end;
    end loop;
  else
    update public.invoices set
      invoice_date = v_date,
      client_id = v_client_id,
      client_name_snapshot = v_name,
      client_phone_snapshot = v_phone,
      client_address_snapshot = v_address,
      client_country_snapshot = v_country_name,
      client_state_snapshot = v_state,
      currency_code = v_currency,
      subtotal = (v_tax ->> 'subtotal')::numeric,
      taxable_value = (v_tax ->> 'taxable_value')::numeric,
      tax_rate = (v_tax ->> 'tax_rate')::numeric,
      tax_amount = (v_tax ->> 'tax_amount')::numeric,
      tax_split = v_tax -> 'tax_split',
      grand_total = (v_tax ->> 'grand_total')::numeric,
      paid_amount = v_paid_amount,
      invoice_status = v_status,
      notes = v_notes,
      company_snapshot = v_company_snap,
      payment_snapshot = v_payment_snap,
      issued_at = coalesce(issued_at, case when v_status = 'issued' then now() end)
    where id = p_invoice_id
    returning id into v_id;

    delete from public.invoice_items where invoice_id = v_id;
  end if;

  v_idx := 0;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    insert into public.invoice_items (invoice_id, description, quantity, unit_price, line_total, sort_order)
    values (v_id, btrim(v_item ->> 'description'), v_qty, v_price, round(v_qty * v_price, 2), v_idx);
    v_idx := v_idx + 1;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Payment status
-- ---------------------------------------------------------------------
create or replace function public.set_invoice_paid(p_invoice_id uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices%rowtype;
begin
  perform public.assert_authorized();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001', hint = 'INVOICE_NOT_FOUND';
  end if;
  update public.invoices
     set paid_amount = case when p_paid then v_inv.grand_total else 0 end
   where id = p_invoice_id;
end $$;

-- ---------------------------------------------------------------------
-- Cancellation (number is kept and never reused)
-- ---------------------------------------------------------------------
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices%rowtype;
begin
  perform public.assert_authorized();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0001', hint = 'INVOICE_NOT_FOUND';
  end if;
  if v_inv.invoice_status = 'cancelled' then
    return;
  end if;
  update public.invoices
     set invoice_status = 'cancelled', cancelled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_invoice_id;
end $$;

-- ---------------------------------------------------------------------
-- Dashboard summary — issued invoices only, grouped by currency
-- (INR and USD totals must never be added together).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.assert_authorized();
  select jsonb_build_object(
    'invoice_count', (select count(*) from public.invoices where invoice_status = 'issued'),
    'draft_count', (select count(*) from public.invoices where invoice_status = 'draft'),
    'cancelled_count', (select count(*) from public.invoices where invoice_status = 'cancelled'),
    'by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency_code', currency_code,
        'invoice_count', cnt,
        'total_value', total,
        'total_paid', paid,
        'total_outstanding', total - paid) order by currency_code)
      from (
        select currency_code, count(*) cnt, sum(grand_total) total, sum(paid_amount) paid
        from public.invoices where invoice_status = 'issued'
        group by currency_code
      ) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
