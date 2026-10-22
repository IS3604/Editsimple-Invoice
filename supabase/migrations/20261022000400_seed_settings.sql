-- =====================================================================
-- Initial company settings (non-secret company profile only).
-- Bank/payment details are deliberately NOT committed here: enter them on
-- the Settings page, or run supabase/private/payment_details.sql
-- (git-ignored) in the SQL editor.
-- =====================================================================
insert into public.company_settings (
  id, company_name, company_email, company_address, gstin,
  indian_payment_details, international_payment_details, default_currency
) values (
  1,
  'EditSimple Editing Services Private Limited',
  'ontacteditsimple@gmail.com',
  E'Sakar Hills, Sainik Society, Shakti Nagar,\nJabalpur, Madhya Pradesh - 482001, India',
  '23AAICE9242K1ZF',
  '{}'::jsonb,
  '{}'::jsonb,
  'USD'
) on conflict (id) do nothing;
