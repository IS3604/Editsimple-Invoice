import { useState } from 'react';
import { toast } from 'sonner';
import { cancelInvoice, getInvoice, setInvoicePaid } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { downloadInvoicePdf, printInvoicePdf } from '@/components/invoice/pdf-actions';

/** Shared invoice row/detail actions with consistent error handling. */
export function useInvoiceActions(onChanged?: () => void) {
  const { handleExpired } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>, success?: string) {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      onChanged?.();
    } catch (e) {
      const ae = toAppError(e);
      if (ae.sessionExpired) handleExpired();
      toast.error(ae.message);
      throw e;
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    download: (id: string) => run(`pdf:${id}`, async () => {
      // Always re-fetch so the PDF reflects exactly what is saved.
      const inv = await getInvoice(id);
      await downloadInvoicePdf(inv).catch(() => { throw new Error('PDF generation failed. Please try again.'); });
    }).catch(() => {}),
    print: (id: string) => run(`print:${id}`, async () => {
      const inv = await getInvoice(id);
      await printInvoicePdf(inv);
    }).catch(() => {}),
    setPaid: (id: string, paid: boolean) =>
      run(`paid:${id}`, () => setInvoicePaid(id, paid), paid ? 'Marked as paid.' : 'Marked as unpaid.').catch(() => {}),
    cancel: (id: string, reason: string) => run(`cancel:${id}`, () => cancelInvoice(id, reason), 'Invoice cancelled.'),
  };
}
