import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { SettingsProvider } from '@/features/settings/SettingsProvider';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAdmin, RequireAuth } from '@/components/layout/guards';
import { Spinner } from '@/components/ui/primitives';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InvoicesPage } from '@/pages/InvoicesPage';
import { InvoiceEditorPage } from '@/pages/InvoiceEditorPage';
import { InvoiceDetailPage } from '@/pages/InvoiceDetailPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { ClientDetailPage } from '@/pages/ClientDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Heavier routes are split out of the main bundle.
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const lazyEl = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

function Root() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <Outlet />
        <Toaster position="top-right" richColors closeButton />
      </SettingsProvider>
    </AuthProvider>
  );
}

export const routes = [
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth><AppShell /></RequireAuth>,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/invoices', element: <InvoicesPage /> },
          { path: '/invoices/new', element: <InvoiceEditorPage /> },
          { path: '/invoices/:id', element: <InvoiceDetailPage /> },
          { path: '/invoices/:id/edit', element: <InvoiceEditorPage /> },
          { path: '/clients', element: <ClientsPage /> },
          { path: '/clients/:id', element: <ClientDetailPage /> },
          { path: '/reports', element: lazyEl(<ReportsPage />) },
          { path: '/settings', element: <RequireAdmin>{lazyEl(<SettingsPage />)}</RequireAdmin> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

export default function App() {
  return <RouterProvider router={router} />;
}
