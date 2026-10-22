import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSettings } from '@/features/settings/SettingsProvider';
import { Button, Card, ErrorBanner, Spinner } from '@/components/ui/primitives';

/**
 * Route guard. NOTE: this is UX only — the real protection is RLS in the
 * database; an unauthorized user who bypasses this sees no data.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profileReady, isAuthorized, signOut, profile } = useAuth();
  const settings = useSettings();
  const location = useLocation();

  if (loading || !profileReady) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (!isAuthorized) {
    return (
      <CenteredCard>
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warn" aria-hidden />
        <h1 className="text-lg font-semibold">Access not yet granted</h1>
        <p className="mt-2 text-sm text-ink-3">
          You are signed in as <strong className="text-ink-2">{profile?.email ?? session.user.email}</strong>, but an
          administrator has not authorised this account. Ask an administrator to grant you access.
        </p>
        <Button className="mt-5" onClick={() => void signOut()}>Sign out</Button>
      </CenteredCard>
    );
  }
  if (settings.error) {
    return <CenteredCard><ErrorBanner message={settings.error} onRetry={() => void settings.reload()} /></CenteredCard>;
  }
  // Pages below can rely on settings being loaded.
  if (settings.loading || !settings.settings) return <FullPageSpinner />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-lg font-semibold">Administrators only</h1>
        <p className="mt-2 text-sm text-ink-3">You do not have permission to view this page.</p>
      </Card>
    );
  }
  return <>{children}</>;
}

export function FullPageSpinner() {
  return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
}

export function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md p-8 text-center">{children}</Card>
    </div>
  );
}
