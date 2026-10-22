// Supabase Edge Function: invite a user and grant them a role.
// Runs server-side, so it may use the service-role key (never shipped to the browser).
//
// Deploy:  supabase functions deploy admin-invite-user
// Secrets: supabase secrets set SITE_URL=https://<you>.github.io/<repo>/  ALLOWED_ORIGIN=https://<you>.github.io
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const siteUrl = Deno.env.get('SITE_URL');

  // 1. Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await asCaller.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: 'Not signed in.' });

  // 2. Caller must be an admin (checked with the service client, not trusted from the request).
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: me } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  if (me?.role !== 'admin') return json(403, { error: 'Only administrators can invite users.' });

  // 3. Validate input.
  let body: { email?: string; role?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request.' }); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'staff';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(400, { error: 'Enter a valid email address.' });

  // 4. Invite and assign role.
  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, '')}/reset-password` : undefined,
  });
  if (invErr || !invited.user) {
    const msg = /already been registered|already exists/i.test(invErr?.message ?? '')
      ? 'A user with this email already exists. Change their role in the list instead.'
      : 'Could not send the invitation.';
    return json(400, { error: msg });
  }

  const { error: roleErr } = await admin.from('profiles').upsert({ id: invited.user.id, email, role }, { onConflict: 'id' });
  if (roleErr) return json(500, { error: 'User invited, but the role could not be set.' });

  return json(200, { ok: true });
});
