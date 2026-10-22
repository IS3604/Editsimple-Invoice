import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Textarea } from './primitives';
import { cn } from '@/lib/utils';

export function Dialog({
  open, onOpenChange, title, description, children, footer, className,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode;
  children?: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px]" />
        <RD.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RD.Title className="text-base font-semibold text-ink">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-1 text-sm text-ink-3">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
            </RD.Close>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** Confirmation dialog for consequential actions. Supports an optional reason field. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', tone = 'primary', onConfirm, withReason,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: ReactNode;
  confirmLabel?: string; tone?: 'primary' | 'danger'; onConfirm: (reason: string) => Promise<void> | void;
  withReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setReason(''); } }}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>Keep as is</Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason);
                onOpenChange(false);
                setReason('');
              } catch {
                // error already reported by the caller (toast); keep dialog open
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {withReason && (
        <div className="space-y-1.5">
          <label htmlFor="confirm-reason" className="text-[13px] font-medium text-ink-2">{withReason}</label>
          <Textarea id="confirm-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
    </Dialog>
  );
}
