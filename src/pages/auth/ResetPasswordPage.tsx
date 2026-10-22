import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, ErrorBanner, Field, Input, errProps } from '@/components/ui/primitives';
import { FullPageSpinner } from '@/components/layout/guards';
import { AuthLayout } from './AuthLayout';

export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<{ pw?: string; pw2?: string }>({});

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <AuthLayout title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <Link to="/forgot-password"><Button variant="primary" className="w-full justify-center">Request a new link</Button></Link>
      </AuthLayout>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof fe = {};
    if (pw.length < 10) errs.pw = 'Use at least 10 characters.';
    if (pw !== pw2) errs.pw2 = 'Passwords do not match.';
    setFe(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) { setError(toAppError(err).message); return; }
    toast.success('Password updated.');
    navigate('/', { replace: true });
  }

  return (
    <AuthLayout title="Choose a new password" subtitle={session.user.email ?? undefined}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Field id="pw" label="New password" kind="required" error={fe.pw} hint="At least 10 characters.">
          <Input {...errProps('pw', fe.pw)} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field id="pw2" label="Confirm password" kind="required" error={fe.pw2}>
          <Input {...errProps('pw2', fe.pw2)} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
