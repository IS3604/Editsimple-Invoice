import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, FilePlus2, Files, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices/new', label: 'Create Invoice', icon: FilePlus2 },
  { to: '/invoices', label: 'All Invoices', icon: Files, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-ink text-[13px] font-bold text-white">ES</div>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold text-ink">EditSimple</div>
        <div className="text-[11.5px] text-ink-3">Invoices</div>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, isAdmin, signOut } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="py-5"><Brand /></div>
      <nav aria-label="Main" className="flex-1 space-y-0.5">
        {NAV.filter((n) => !n.adminOnly || isAdmin).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-canvas hover:text-ink',
            )}
          >
            <Icon className="h-[17px] w-[17px]" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line pt-4 pb-5">
        <div className="mb-2 px-3">
          <div className="truncate text-[13px] font-medium text-ink">{profile?.full_name || profile?.email}</div>
          <div className="text-[12px] capitalize text-ink-3">{profile?.role}</div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-2 hover:bg-canvas hover:text-ink"
        >
          <LogOut className="h-[17px] w-[17px]" aria-hidden /> Logout
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface px-3 lg:block print:hidden">
        <SideNav />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden print:hidden">
        <Brand />
        <Button variant="ghost" size="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface px-3 shadow-xl">
            <Button variant="ghost" size="icon" className="absolute right-3 top-4" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-60">
        <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
