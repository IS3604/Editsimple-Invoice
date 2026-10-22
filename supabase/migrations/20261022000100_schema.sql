-- =====================================================================
-- EditSimple Invoices — core schema
-- Tables, constraints, indexes and integrity triggers.
-- Security (RLS, grants) lives in 20261022000300_security.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profiles: one row per auth user. role controls access.
--   admin   : full access, including settings and user management
--   staff   : invoices + clients, read-only settings (future multi-user)
--   pending : signed in but NOT authorized for any business data
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'pending'
              check (role in ('admin', 'staff', 'pending')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clients (master records). Invoices keep their own snapshot.
-- ---------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 200),
  phone         text check (phone is null or length(phone) <= 40),
  address       text check (address is null or length(address) <= 1000),
  country_code  char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  country_name  text not null check (length(country_name) between 1 and 100),
  state         text check (state is null or length(state) <= 100),
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Indian clients must have a state; others must not carry one.
  constraint clients_state_rule check (
    (country_code = 'IN' and state is not null and length(btrim(state)) > 0)
    or (country_code <> 'IN' and state is null)
  )
);

create index clients_name_idx on public.clients (lower(name));
create index clients_country_idx on public.clients (country_code);
create index clients_phone_idx on public.clients (phone);

-- ---------------------------------------------------------------------
-- Company settings: single row (id = 1).
-- ---------------------------------------------------------------------
create table public.company_settings (
  id                            smallint primary key default 1 check (id = 1),
  company_name                  text not null,
  company_email                 text not null,
  company_address               text not null,
  gstin                         text,
  indian_payment_details        jsonb not null default '{}'::jsonb,
  international_payment_details jsonb not null default '{}'::jsonb,
  default_currency              char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  tax_configuration             jsonb not null default
    '{"india_tax_rate": 18, "india_split_mode": "none", "supplier_state": "Madhya Pradesh"}'::jsonb,
  pdf_footer_text               text not null default 'Thank you for your business.',
  payment_terms                 text,
  default_invoice_date          text not null default 'today'
                                check (default_invoice_date in ('today', 'blank')),
  updated_by                    uuid references auth.users (id) on delete set null,
  updated_at                    timestamptz not null default now(),
  constraint tax_rate_valid check (
    (tax_configuration ->> 'india_tax_rate') ~ '^[0-9]+(\.[0-9]{1,2})?$'
    and (tax_configuration ->> 'india_tax_rate')::numeric between 0 and 100
  ),
  constraint split_mode_valid check (
    tax_configuration ->> 'india_split_mode' in ('none', 'igst', 'cgst_sgst', 'auto_by_state')
  )
);

-- ---------------------------------------------------------------------
-- Per-country invoice counters. Only touched by allocate_invoice_number().
-- ---------------------------------------------------------------------
create table public.invoice_sequences (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  last_value   integer not null default 0 check (last_value >= 0),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------
create table public.invoices (
  id                       uuid primary key default gen_random_uuid(),
  invoice_number           text not null unique check (invoice_number ~ '^[A-Z]{2}[0-9]{4,}$'),
  country_code             char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  invoice_date             date not null,
  client_id                uuid references public.clients (id) on delete set null,

  client_name_snapshot     text not null check (length(btrim(client_name_snapshot)) between 1 and 200),
  client_phone_snapshot    text,
  client_address_snapshot  text,
  client_country_snapshot  text not null,
  client_state_snapshot    text,

  currency_code            char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  subtotal                 numeric(14, 2) not null check (subtotal >= 0),
  taxable_value            numeric(14, 2) not null check (taxable_value >= 0),
  tax_rate                 numeric(5, 2)  not null check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount               numeric(14, 2) not null check (tax_amount >= 0),
  tax_split                jsonb,
  grand_total              numeric(14, 2) not null check (grand_total >= 0),
  paid_amount              numeric(14, 2) not null default 0 check (paid_amount >= 0),
  payment_status           text not null default 'unpaid'
                           check (payment_status in ('unpaid', 'partial', 'paid')),
  invoice_status           text not null default 'draft'
                           check (invoice_status in ('draft', 'issued', 'cancelled')),
  notes                    text check (notes is null or length(notes) <= 2000),

  -- Frozen copies of company + bank details used on this invoice.
  company_snapshot         jsonb not null,
  payment_snapshot         jsonb not null,

  issued_at                timestamptz,
  cancelled_at             timestamptz,
  cancel_reason            text,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint invoices_number_matches_country check (left(invoice_number, 2) = country_code),
  constraint invoices_paid_not_over check (paid_amount <= grand_total),
  constraint invoices_tax_reconciles check (taxable_value + tax_amount = subtotal),
  constraint invoices_grand_total_rule check (grand_total = subtotal),
  constraint invoices_state_rule check (
    (country_code = 'IN' and client_state_snapshot is not null)
    or (country_code <> 'IN' and client_state_snapshot is null)
  ),
  constraint invoices_non_india_zero_tax check (country_code = 'IN' or (tax_rate = 0 and tax_amount = 0))
);

create index invoices_date_idx on public.invoices (invoice_date desc);
create index invoices_country_idx on public.invoices (country_code);
create index invoices_state_idx on public.invoices (client_state_snapshot);
create index invoices_payment_status_idx on public.invoices (payment_status);
create index invoices_status_idx on public.invoices (invoice_status);
create index invoices_client_idx on public.invoices (client_id);
create index invoices_client_name_idx on public.invoices (lower(client_name_snapshot));

-- ---------------------------------------------------------------------
-- Invoice items
-- ---------------------------------------------------------------------
create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  description  text not null check (length(btrim(description)) between 1 and 2000),
  quantity     numeric(12, 3) not null check (quantity > 0),
  unit_price   numeric(14, 2) not null check (unit_price >= 0),
  line_total   numeric(14, 2) not null check (line_total >= 0),
  sort_order   integer not null default 0,
  constraint invoice_items_line_total_rule check (line_total = round(quantity * unit_price, 2))
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, sort_order);

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger clients_updated_at before update on public.clients
  for each row execute function public.tg_set_updated_at();
create trigger company_settings_updated_at before update on public.company_settings
  for each row execute function public.tg_set_updated_at();
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.tg_set_updated_at();

-- Invoice numbers and their country are permanent; cancelled invoices are frozen.
create or replace function public.tg_invoices_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.invoice_number is distinct from old.invoice_number then
    raise exception 'Invoice numbers are permanent and cannot be changed'
      using errcode = 'P0001', hint = 'INVOICE_NUMBER_IMMUTABLE';
  end if;
  if new.country_code is distinct from old.country_code then
    raise exception 'The country of a saved invoice cannot be changed'
      using errcode = 'P0001', hint = 'INVOICE_COUNTRY_IMMUTABLE';
  end if;
  if old.invoice_status = 'cancelled' then
    raise exception 'Cancelled invoices cannot be modified'
      using errcode = 'P0001', hint = 'INVOICE_CANCELLED';
  end if;
  if old.invoice_status = 'issued' and new.invoice_status = 'draft' then
    raise exception 'An issued invoice cannot return to draft'
      using errcode = 'P0001', hint = 'INVOICE_STATUS_INVALID';
  end if;
  return new;
end $$;

create trigger invoices_guard before update on public.invoices
  for each row execute function public.tg_invoices_guard();

-- payment_status is always derived from paid_amount / grand_total.
create or replace function public.tg_invoices_payment_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- A zero-value invoice has nothing outstanding, so it counts as paid.
  if new.paid_amount >= new.grand_total then
    new.payment_status := 'paid';
  elsif new.paid_amount > 0 then
    new.payment_status := 'partial';
  else
    new.payment_status := 'unpaid';
  end if;
  return new;
end $$;

create trigger invoices_payment_status before insert or update on public.invoices
  for each row execute function public.tg_invoices_payment_status();

-- Invoices are never hard-deleted (keeps number history intact).
create or replace function public.tg_block_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Invoices cannot be deleted; cancel them instead'
    using errcode = 'P0001', hint = 'INVOICE_DELETE_FORBIDDEN';
end $$;

create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.tg_block_delete();
