import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { config } from './config.js';
import { invoicePdf } from './invoicePdf.js';

const phoneDigits = (phone: unknown) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return /^\d{10,15}$/.test(normalized) ? normalized : '';
};
export const whatsappReady = () => /^v\d+\.\d+$/.test(config.whatsapp.graphVersion) &&
  /^\d+$/.test(config.whatsapp.phoneNumberId) && Boolean(config.whatsapp.accessToken && config.whatsapp.templateName);
const api = () => `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;

async function sendPdf(invoice: FirebaseFirestore.DocumentData & { id: string }) {
  const recipient = phoneDigits(invoice.customerPhone);
  if (!recipient) throw Object.assign(new Error('invalid_phone'), { code: 'invalid_phone' });
  const pdf = invoicePdf(invoice);
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', 'application/pdf');
  form.set('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), `${invoice.id}.pdf`);
  const headers = { Authorization: `Bearer ${config.whatsapp.accessToken}` };
  const media = await fetch(`${api()}/media`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(15_000) });
  if (!media.ok) throw Object.assign(new Error('media_upload_failed'), { code: 'media_upload_failed', permanent: media.status < 500 });
  const mediaId = String((await media.json() as { id?: string }).id || '');
  if (!mediaId) throw Object.assign(new Error('media_id_missing'), { code: 'media_id_missing' });
  const message = await fetch(`${api()}/messages`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient,
      type: 'template', template: { name: config.whatsapp.templateName,
        language: { code: config.whatsapp.templateLanguage }, components: [{ type: 'header', parameters: [
          { type: 'document', document: { id: mediaId, filename: `${invoice.id}.pdf` } }
        ] }] } }), signal: AbortSignal.timeout(15_000) });
  if (!message.ok) throw Object.assign(new Error('message_rejected'), { code: 'message_rejected', permanent: message.status < 500 });
  const body = await message.json() as { messages?: { id?: string }[] };
  const messageId = String(body.messages?.[0]?.id || '');
  if (!messageId) throw Object.assign(new Error('message_id_missing'), { code: 'message_id_missing' });
  return messageId;
}

// The Firestore outbox is claimed before the provider call. An ambiguous
// timeout is marked unknown for review rather than automatically sending twice.
export async function deliverInvoice(db: Firestore, eventId: string) {
  if (!whatsappReady()) return { status: 'awaiting_provider' };
  const ref = db.collection('erp_syncLog').doc(eventId);
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const event = snap.data();
    if (!event || event.event !== 'invoice_delivery') return null;
    if (event.status === 'sent' || event.status === 'consent_missing' || event.status === 'unknown') return null;
    if (event.status === 'processing') {
      if (event.leaseUntil?.toMillis() > Date.now()) return null;
      tx.update(ref, { status: 'unknown', error: 'worker_interrupted', updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    tx.update(ref, { status: 'processing', leaseUntil: new Date(Date.now() + 60_000),
      updatedAt: FieldValue.serverTimestamp() });
    return { invoiceId: String(event.invoiceId || '') };
  });
  if (!claim) return { status: 'skipped' };
  try {
    const invoiceSnap = await db.collection('erp_invoices').doc(claim.invoiceId).get();
    const invoice = { id: invoiceSnap.id, ...(invoiceSnap.data() || {}) } as FirebaseFirestore.DocumentData & { id: string };
    if (!invoiceSnap.exists || !invoice.whatsappOptIn || !phoneDigits(invoice.customerPhone)) {
      await ref.update({ status: 'consent_missing', leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
      return { status: 'consent_missing' };
    }
    const providerMessageId = await sendPdf(invoice);
    await ref.update({ status: 'sent', providerMessageId, leaseUntil: null, sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() });
    return { status: 'sent', providerMessageId };
  } catch (error) {
    const code = String((error as { code?: string }).code || 'provider_outcome_unknown');
    const status = (error as { permanent?: boolean }).permanent ? 'failed' : 'unknown';
    await ref.update({ status, error: code, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
    return { status, error: code };
  }
}
