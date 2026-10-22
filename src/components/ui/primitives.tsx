import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-canvas shadow-sm',
  ghost: 'text-ink-2 hover:bg-canvas hover:text-ink',
  danger: 'bg-danger text-white hover:bg-[#912018] shadow-sm',
  link: 'text-accent hover:underline px-0 h-auto',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, type = 'button', ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-55 disabled:pointer-events-none',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Inputs
const fieldBase =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 shadow-[inset_0_1px_1px_rgb(16_24_40/0.03)] transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-canvas disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, 'h-9', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, 'py-2 min-h-[72px] resize-y', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, 'h-9 pr-8 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%236b7587%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_0.6rem_center]', className)} {...p}>
      {children}
    </select>
  );
});

// ---------------------------------------------------------------- Field
export type FieldKind = 'required' | 'optional' | 'auto';

export function Field({
  id, label, kind = 'optional', error, hint, children, className,
}: { id: string; label: string; kind?: FieldKind; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        {label}
        {kind === 'required' && <span className="text-danger" aria-hidden>*</span>}
        {kind === 'required' && <span className="sr-only">(required)</span>}
        {kind === 'auto' && (
          <span className="rounded bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-accent">Auto</span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12.5px] text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** aria props wiring an input to its Field error */
export const errProps = (id: string, error?: string) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});

// ---------------------------------------------------------------- Card
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', className)} {...p} />;
}
export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-2 ring-line-strong',
  ok: 'bg-ok-soft text-ok ring-ok/20',
  warn: 'bg-warn-soft text-warn ring-warn/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  accent: 'bg-accent-soft text-accent ring-accent/20',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- Misc
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-line/70', className)} aria-hidden />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-canvas p-3 text-ink-3">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Checkbox({ id, checked, onChange, label, description, disabled }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-line-strong accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-[12.5px] text-ink-3">{description}</span>}
      </span>
    </label>
  );
}
