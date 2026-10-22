import { createElement } from 'react';
import type { InvoiceWithItems } from '@/types/db';
import { viewFromInvoice } from '@/lib/invoice-view';

/**
 * PDFs are generated ONLY from saved invoices fetched from the database,
 * so a PDF can never show unsaved or inconsistent totals.
 * The PDF library is loaded lazily to keep the main bundle small.
 */
async function renderBlob(invoice: InvoiceWithItems): Promise<Blob> {
  const [{ pdf }, { InvoicePdf, registerPdfFonts }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./InvoicePdf'),
  ]);
  registerPdfFonts();
  const doc = createElement(InvoicePdf, { view: viewFromInvoice(invoice) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(doc as any).toBlob();
}

export function pdfFileName(invoice: Pick<InvoiceWithItems, 'invoice_number' | 'client_name_snapshot'>) {
  const client = invoice.client_name_snapshot.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
  return `Invoice-${invoice.invoice_number}${client ? `-${client}` : ''}.pdf`;
}

export async function downloadInvoicePdf(invoice: InvoiceWithItems): Promise<void> {
  const blob = await renderBlob(invoice);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName(invoice);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the PDF in a hidden iframe and triggers the print dialog. */
export async function printInvoicePdf(invoice: InvoiceWithItems): Promise<void> {
  const blob = await renderBlob(invoice);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank', 'noopener');
      }
      resolve();
    };
  });
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60_000);
}

export { renderBlob as renderInvoicePdfBlob };
