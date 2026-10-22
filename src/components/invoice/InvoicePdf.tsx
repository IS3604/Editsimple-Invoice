import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatMoney, formatQuantity } from '@/lib/money';
import type { InvoiceView } from '@/lib/invoice-view';
import { assetUrl, formatDate } from '@/lib/utils';

let fontsRegistered = false;
export function registerPdfFonts(base = '') {
  if (fontsRegistered) return;
  const u = (f: string) => (base ? `${base}/fonts/${f}` : assetUrl(`fonts/${f}`));
  // Inter includes the ₹ glyph, which the built-in PDF fonts lack.
  Font.register({
    family: 'Inter',
    fonts: [
      { src: u('Inter-Regular.ttf'), fontWeight: 400 },
      { src: u('Inter-Medium.ttf'), fontWeight: 500 },
      { src: u('Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: u('Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const INK = '#0f1b2d';
const INK2 = '#3b4658';
const INK3 = '#6b7587';
const LINE = '#e3e6eb';
const CANVAS = '#f6f7f9';

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, color: INK, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 42, lineHeight: 1.4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 14 },
  companyName: { fontSize: 12, fontWeight: 600 },
  muted: { color: INK2 },
  faint: { color: INK3 },
  title: { fontSize: 18, fontWeight: 600, textAlign: 'right', letterSpacing: 0.3 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  metaLabel: { color: INK2, width: 60, textAlign: 'right', marginRight: 8 },
  metaValue: { fontWeight: 500, minWidth: 70, textAlign: 'right' },
  section: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  label: { fontSize: 7.5, fontWeight: 600, color: INK3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  th: { flexDirection: 'row', backgroundColor: CANVAS, borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE, paddingVertical: 5 },
  thText: { fontSize: 7.5, fontWeight: 600, color: INK3, textTransform: 'uppercase', letterSpacing: 0.6 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  cNum: { width: 22, paddingHorizontal: 4 },
  cDesc: { flex: 1, paddingHorizontal: 4 },
  cQty: { width: 52, paddingHorizontal: 4, textAlign: 'right' },
  cPrice: { width: 86, paddingHorizontal: 4, textAlign: 'right' },
  cTotal: { width: 92, paddingHorizontal: 4, textAlign: 'right' },
  totals: { marginTop: 10, marginLeft: 'auto', width: 240 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: INK, marginTop: 4, paddingTop: 5, fontSize: 11, fontWeight: 600 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  footer: { position: 'absolute', bottom: 24, left: 42, right: 42, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: INK3, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  watermark: { position: 'absolute', top: 330, left: 0, right: 0, textAlign: 'center', fontSize: 64, fontWeight: 700, color: '#b42318', opacity: 0.12, transform: 'rotate(-28deg)' },
});

const money = (v: bigint | null, c: string) => (v === null ? '—' : formatMoney(v, c));

export function InvoicePdf({ view }: { view: InvoiceView }) {
  const c = view.currency;
  const status = view.invoiceStatus === 'cancelled' ? 'CANCELLED' : view.paymentStatus === 'paid' ? 'PAID' : view.paymentStatus === 'partial' ? 'PARTIALLY PAID' : 'UNPAID';
  const statusColor = view.invoiceStatus === 'cancelled' ? '#b42318' : view.paymentStatus === 'paid' ? '#067647' : '#b54708';

  return (
    <Document title={`Invoice ${view.number ?? ''}`} author={view.company.company_name} creator="EditSimple Invoices" producer="EditSimple Invoices">
      <Page size="A4" style={s.page} wrap>
        {view.invoiceStatus === 'cancelled' && <Text style={s.watermark} fixed>CANCELLED</Text>}
        {view.invoiceStatus === 'draft' && <Text style={[s.watermark, { color: INK3 }]} fixed>DRAFT</Text>}

        <View style={s.header}>
          <View style={{ maxWidth: '58%' }}>
            <Text style={s.companyName}>{view.company.company_name}</Text>
            <Text style={[s.muted, { marginTop: 3 }]}>{view.company.company_address}</Text>
            <Text style={s.muted}>{view.company.company_email}</Text>
            {view.isIndia && view.company.gstin ? <Text style={s.muted}>GSTIN: {view.company.gstin}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>{view.isIndia ? 'TAX INVOICE' : 'INVOICE'}</Text>
            <View style={[s.metaRow, { marginTop: 8 }]}><Text style={s.metaLabel}>Invoice No.</Text><Text style={s.metaValue}>{view.number ?? '—'}</Text></View>
            <View style={s.metaRow}><Text style={s.metaLabel}>Date</Text><Text style={s.metaValue}>{formatDate(view.date)}</Text></View>
          </View>
        </View>

        <View style={s.section}>
          <View style={{ maxWidth: '60%' }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={{ fontWeight: 500 }}>{view.client.name}</Text>
            {view.client.address ? <Text style={s.muted}>{view.client.address}</Text> : null}
            <Text style={s.muted}>{[view.client.state, view.client.country].filter(Boolean).join(', ')}</Text>
            {view.client.phone ? <Text style={s.muted}>{view.client.phone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Status</Text>
            <Text style={{ fontWeight: 600, color: statusColor }}>{status}</Text>
          </View>
        </View>

        {/* Items table — header repeats on every page via `fixed` */}
        <View style={s.th} fixed>
          <Text style={[s.thText, s.cNum]}>#</Text>
          <Text style={[s.thText, s.cDesc]}>Description</Text>
          <Text style={[s.thText, s.cQty]}>Qty</Text>
          <Text style={[s.thText, s.cPrice]}>Unit price</Text>
          <Text style={[s.thText, s.cTotal]}>Total</Text>
        </View>
        {view.items.map((it, i) => (
          <View key={i} style={s.tr} wrap={it.description.length > 700} minPresenceAhead={14}>
            <Text style={[s.cNum, s.faint]}>{i + 1}</Text>
            <Text style={s.cDesc}>{it.description}</Text>
            <Text style={s.cQty}>{formatQuantity(it.quantity)}</Text>
            <Text style={s.cPrice}>{money(it.unitPrice, c)}</Text>
            <Text style={[s.cTotal, { fontWeight: 500 }]}>{money(it.lineTotal, c)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <TotalRow label={view.isIndia ? 'Subtotal (Inclusive of Tax)' : 'Subtotal'} value={money(view.subtotal, c)} />
          {view.isIndia && <TotalRow label="Taxable Value" value={money(view.taxableValue, c)} muted />}
          {view.isIndia && !view.split && <TotalRow label={`Tax (${view.taxRateLabel} Inclusive)`} value={money(view.taxAmount, c)} muted />}
          {view.isIndia && view.split?.type === 'igst' && <TotalRow label={`IGST (${view.split.rate} Inclusive)`} value={money(view.split.igst, c)} muted />}
          {view.isIndia && view.split?.type === 'cgst_sgst' && (
            <>
              <TotalRow label={`CGST (${view.split.rate} Inclusive)`} value={money(view.split.cgst, c)} muted />
              <TotalRow label={`SGST (${view.split.rate} Inclusive)`} value={money(view.split.sgst, c)} muted />
            </>
          )}
          {!view.isIndia && <TotalRow label="Tax" value={money(0n, c)} muted />}
          <View style={s.grand}><Text>Grand Total</Text><Text>{money(view.grandTotal, c)}</Text></View>
          {view.paymentStatus !== 'unpaid' && view.invoiceStatus !== 'cancelled' && (
            <TotalRow label="Balance due" value={money(view.grandTotal - view.paidAmount, c)} muted />
          )}
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={{ width: '55%' }}>
            <Text style={s.label}>Payment info</Text>
            {view.paymentLines.map((l, i) => (
              <Text key={i} style={l.label ? undefined : { fontWeight: 500 }}>
                {l.label ? <Text style={s.faint}>{l.label}: </Text> : null}
                {l.value}
              </Text>
            ))}
          </View>
          <View style={{ width: '40%' }}>
            {view.company.payment_terms ? (
              <>
                <Text style={s.label}>Terms</Text>
                <Text style={s.muted}>{view.company.payment_terms}</Text>
              </>
            ) : null}
            {view.notes ? (
              <>
                <Text style={[s.label, { marginTop: 8 }]}>Notes</Text>
                <Text style={s.muted}>{view.notes}</Text>
              </>
            ) : null}
          </View>
        </View>

        {view.company.pdf_footer_text ? (
          <Text style={{ marginTop: 22, textAlign: 'center', color: INK2 }} wrap={false}>{view.company.pdf_footer_text}</Text>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{view.company.company_name} · {view.number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={s.totalRow}>
      <Text style={muted ? s.muted : undefined}>{label}</Text>
      <Text style={muted ? s.muted : undefined}>{value}</Text>
    </View>
  );
}
