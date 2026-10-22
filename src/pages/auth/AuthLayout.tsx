import type { ReactNode } from 'react';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-ink text-sm font-bold text-white">ES</div>
          <div className="leading-tight">
            <div className="font-semibold text-ink">EditSimple</div>
            <div className="text-xs text-ink-3">Invoice Management</div>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-7 shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-ink-3">{footer}</div>}
      </div>
    </div>
  );
}
