import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button, ErrorBanner, Field, Input, errProps } from '@/components/ui/primitives';
import { FullPageSpinner } from '@/components/layout/guards';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});

  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErr = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = 'Enter a valid email address.';
    if (!password) fe.password = 'Password is required.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(toAppError(err).message);
    else navigate(from, { replace: true });
  }

  return (
    <AuthLayout title="Sign in" subtitle="Authorised EditSimple staff only.">
      {!supabaseConfigured && (
        <div className="mb-4"><ErrorBanner message="Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY." /></div>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Field id="email" label="Email" kind="required" error={fieldErr.email}>
          <Input {...errProps('email', fieldErr.email)} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="password" label="Password" kind="required" error={fieldErr.password}>
          <Input {...errProps('password', fieldErr.password)} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
