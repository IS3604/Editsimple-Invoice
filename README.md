# EditSimple Invoices

Internal invoice generator and management dashboard for **EditSimple Editing Services Private Limited**.

React + TypeScript + Vite + Tailwind on the front end (static, deployable to GitHub Pages), Supabase (Auth + PostgreSQL + Row Level Security) on the back end.

---

## 1. Architecture

```
 Browser (GitHub Pages, static files only)
 ┌───────────────────────────────────────────────┐
 │ React SPA                                     │
 │  • UI, live preview, client-side validation   │
 │  • PDF generation (@react-pdf, lazy-loaded)   │
 │  • Uses ONLY the public URL + publishable key │
 └───────────────┬───────────────────────────────┘
                 │ HTTPS (user's JWT)
 ┌───────────────▼───────────────────────────────┐
 │ Supabase                                      │
 │  Auth ── profiles.role: admin | staff | pending│
 │  PostgREST ── RLS on every table              │
 │  RPCs (SECURITY DEFINER, re-validate input):  │
 │    save_invoice · set_invoice_paid ·          │
 │    cancel_invoice · preview_invoice_number ·  │
 │    dashboard_summary                          │
 │  Edge Function: admin-invite-user (service key│
 │    lives here only)                           │
 └───────────────────────────────────────────────┘
```

Key decisions

| Concern | Decision |
|---|---|
| **Who can see data** | RLS: only `admin`/`staff` profiles can read business tables. New accounts are `pending` (no access). Anonymous users get `permission denied` on everything. Hiding buttons is UX only. |
| **Totals can't be forged** | The browser has **no** insert/update rights on `invoices` / `invoice_items`. All writes go through `save_invoice()`, which recomputes every line, subtotal, taxable value and tax in `numeric`, and rejects the save if the browser's `expected_grand_total` differs. |
| **Invoice numbers** | `IN0001`, `US0001`, `GB0001`… per country. Allocated inside `save_invoice()` with `INSERT … ON CONFLICT DO UPDATE` on `invoice_sequences` (row lock → no duplicates under concurrency). The form shows a *preview* that does not consume a number. Numbers are immutable (trigger), invoices can't be deleted (trigger), and cancelled numbers are never reused. Drafts reserve their number on first save. A saved invoice's country is locked because its number depends on it. |
| **Tax** | India: prices are tax-**inclusive**. `taxable = round(gross ÷ 1.18, 2)`, `tax = gross − taxable`, `grand total = gross`. Other countries: 0 %. Rate and IGST / CGST+SGST display are configurable in Settings. The same algorithm exists in TypeScript (`src/lib/tax.ts`, BigInt minor units — no floats) and SQL (`compute_invoice_tax`); tests assert both give identical results. |
| **Money** | Integers in paise/cents (`BigInt`) on the client, `numeric(14,2)` in the DB. INR and USD are never summed together — dashboard and reports group by currency. |
| **History is stable** | Each invoice stores a snapshot of the client details, company details and bank details. Editing a client or Settings never changes an issued invoice or its PDF. Drafts pick up new settings until issued. |
| **PDF** | Generated client-side from the **saved** invoice (re-fetched from the DB), so it can never show unsaved totals. Inter font embedded (has the ₹ glyph), table header repeats on each page, page numbers, long descriptions wrap. |
| **Routing on GitHub Pages** | `BrowserRouter` + `404.html` copy of `index.html` (and `.nojekyll`), so refreshing `/invoices/123` works. Password-reset links use PKCE `?code=` so they also work. |

## 2. Project structure

```
src/
  App.tsx                 routes (protected + public)
  lib/
    money.ts              BigInt decimal-safe money helpers
    tax.ts                country tax rules (mirrors SQL)
    invoice-form.ts       form model, validation, RPC payload
    invoice-view.ts       one render model for preview + PDF
    api.ts                all Supabase calls
    errors.ts             safe, human-readable error mapping
    countries.ts · indian-states.ts · reports.ts
  features/auth           AuthProvider (session, role, expiry)
  features/settings       SettingsProvider
  components/ui           Button, Field, Dialog, Combobox, …
  components/invoice      ItemsEditor, InvoiceTable, InvoiceDocument (HTML), InvoicePdf
  pages/                  Dashboard, Invoices, InvoiceEditor, InvoiceDetail, Clients, Reports, Settings, auth/*
supabase/
  migrations/             schema → functions → RLS/grants → seed
  functions/admin-invite-user/   Edge Function (service role, server-side only)
  private/                payment_details.sql (git-ignored) + .example.sql
tests/db/                 PostgreSQL tests (RLS, numbering, concurrency, tax)
scripts/                  test-db.sh, spa-fallback.mjs
.github/workflows/deploy.yml
```

## 3. Local development

Requirements: Node 20+ (22 recommended). PostgreSQL 15+ server binaries only if you want to run the DB tests locally.

```bash
npm install
cp .env.example .env.local      # fill in your Supabase URL + publishable key
npm run dev                     # http://localhost:5173
```

## 4. Supabase setup

1. **Create a project** at supabase.com (region close to India, e.g. Mumbai).
2. **Run the migrations**, in order, in *SQL Editor* (or `supabase link && supabase db push` with the CLI):
   `supabase/migrations/20261022000100_schema.sql` → `…0200_functions.sql` → `…0300_security.sql` → `…0400_seed_settings.sql`
3. **Bank details**: run `supabase/private/payment_details.sql` in the SQL Editor (or enter them later on the Settings page). This file is git-ignored on purpose.
4. **Auth settings** (Authentication → Providers / URL Configuration):
   - **Disable “Allow new users to sign up”.** Accounts are created by an admin only.
   - Site URL: your deployed URL, e.g. `https://<user>.github.io/<repo>/`
   - Redirect URLs: add `https://<user>.github.io/<repo>/reset-password` and `http://localhost:5173/reset-password`
5. **API keys** (Project Settings → API): copy the Project URL and the *publishable* (or legacy *anon*) key into `.env.local`. **Never** use the `service_role`/secret key in the frontend.

### Create the first administrator

1. Authentication → Users → **Add user** → enter your email + a strong password (tick “Auto confirm”).
2. SQL Editor:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Your Name'
   where email = 'you@example.com';
   ```
3. Sign in. Further users can be invited from **Settings → Authorised users** (needs the Edge Function below) or created in the dashboard and promoted from the same Settings table.

### Optional: invite users from the app

```bash
npm i -g supabase
supabase login && supabase link --project-ref <ref>
supabase secrets set SITE_URL=https://<user>.github.io/<repo>/ ALLOWED_ORIGIN=https://<user>.github.io
supabase functions deploy admin-invite-user
```

## 5. Deploy to GitHub Pages

### Option A — simplest (no Actions): prebuilt `docs/` folder
`docs/` already contains a production build for `https://is3604.github.io/Editsimple-Invoice/`.
Repo **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**. Done.
After code changes, rebuild with `npm run build:docs` (needs `.env.local`) and upload `docs/` again.

### Option B — GitHub Actions (builds + runs tests on every push)

1. Push the repo to GitHub (`git init && git add . && git commit -m "Initial commit" && git remote add origin … && git push -u origin main`).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Repo **Settings → Secrets and variables → Actions → Variables** (these are public values):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_BASE_PATH` — only if using a custom domain (set to `/`). Otherwise it defaults to `/<repo>/`.
4. Push to `main`. The workflow runs unit, UI and database tests, type-checks, builds and deploys.

Manual build: `VITE_BASE_PATH=/<repo>/ npm run build` → upload `dist/`.

## 6. Tests

```bash
npm test          # unit + UI + PDF (37 tests)
npm run test:db   # spins up a throw-away PostgreSQL, applies all migrations, runs 31 DB tests
npm run typecheck
```

Covered: ₹1,180 → ₹1,000 + ₹180 inclusive tax; $1,000 at 0 %; multiple items; decimal quantities/prices; numbering per country; 25 concurrent saves (no duplicates or gaps); preview doesn't consume numbers; country change before saving; State required for India and cleared elsewhere; paid/unpaid and outstanding; paid ≤ total; PDF generation incl. multi-page; protected routes; RLS for anonymous/pending/staff/admin; edit keeps number; cancellation never reuses numbers; snapshots stay stable after settings/client changes; last admin can't be demoted; self-promotion blocked.

## 7. Security notes & GitHub Pages limitations

- GitHub Pages serves **static files only**. Everything in `dist/` is public, including the Supabase URL and publishable key — this is expected; RLS is what protects the data. Anyone can load the login page; nobody can read data without an authorised account.
- The service-role key exists only in Supabase (Edge Function secrets). It is never in the repo or bundle.
- GitHub Pages can't set custom security headers (CSP, HSTS preload, frame-ancestors). If you need them, host the same `dist/` on Cloudflare Pages / Netlify / Vercel (still deployed from GitHub) and add headers there.
- On the **free** GitHub plan, Pages requires a **public** repository. The code is safe to publish, but keep `supabase/private/` out (it is git-ignored) — or use a paid plan / another host with a private repo.
- Sessions are stored in `localStorage` by supabase-js. Use the app only on trusted devices and sign out on shared ones.
- `noindex` is set so search engines don't index the login page.

## 8. Backups & migrations

- Supabase Pro includes daily backups (and optional point-in-time recovery). On the free plan, export regularly: `supabase db dump --data-only -f backup-$(date +%F).sql` (or Database → Backups).
- Add schema changes as new timestamped files in `supabase/migrations/`; never edit a migration that has already run in production. Run `npm run test:db` before applying.

## 9. Things to review before going live

- **Company email** is seeded as `ontacteditsimple@gmail.com` exactly as supplied — it looks like it may be missing a “c” (`contacteditsimple@…`). Fix it in Settings if so.
- **Tax treatment** is the simplified rule requested (India 18 % inclusive, everyone else 0 %). Confirm with your CA whether IGST vs CGST+SGST, LUT/export-of-services wording, SAC codes or other GST invoice fields are needed; the rate and breakdown are configurable in Settings.
- International invoices default to USD; change in Settings if needed. Existing invoices keep their currency.
