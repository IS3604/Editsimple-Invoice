import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { Button, ErrorBanner, Field, Input, errProps } from '@/components/ui/primitives';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFieldErr('Enter a valid email address.'); return; }
    setFieldErr(undefined);
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    // Don't reveal whether the email exists; only show transport errors.
    if (err && !/user not found/i.test(err.message)) setError(toAppError(err).message);
    else setSent(true);
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to choose a new password."
      footer={<Link to="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <p role="status" className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field id="email" label="Email" kind="required" error={fieldErr}>
            <Input {...errProps('email', fieldErr)} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
