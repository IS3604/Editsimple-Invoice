-- Run once in the Supabase SQL editor (as the project owner).
-- This file is git-ignored on purpose: it contains placeholders; copy to payment_details.sql and fill in.
update public.company_settings set
  indian_payment_details = '{
    "lines": [
      {"label": "", "value": "EditSimple Editing Services Private Limited"},
      {"label": "Account Number", "value": "<ACCOUNT NUMBER>"},
      {"label": "Bank Name", "value": "IDFC First Bank"},
      {"label": "IFSC Code", "value": "<IFSC>"},
      {"label": "UPI", "value": "<UPI ID>"},
      {"label": "GSTIN", "value": "23AAICE9242K1ZF"},
      {"label": "Email", "value": "ontacteditsimple@gmail.com"},
      {"label": "Address", "value": "Sakar Hills, Sainik Society, Shakti Nagar,\nJabalpur, Madhya Pradesh - 482001, India"}
    ]
  }'::jsonb,
  international_payment_details = '{
    "lines": [
      {"label": "Account Name", "value": "EditSimple Editing Services Private Limited"},
      {"label": "Bank Name", "value": "JPMORGAN CHASE BANK, N.A."},
      {"label": "Account Number", "value": "<ACCOUNT NUMBER>"},
      {"label": "Beneficiary Address", "value": "383 Madison Ave, New York, NY 10179, USA"},
      {"label": "Routing Number", "value": "<ROUTING NUMBER>"},
      {"label": "Account Type", "value": "Business Checking"}
    ]
  }'::jsonb
where id = 1;
