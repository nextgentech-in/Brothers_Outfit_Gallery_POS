import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { customerBillUrl } from './billLink.js';
import { config } from './config.js';

export const billSmsReady = () => Boolean(config.sms.apiKey && config.sms.senderId && config.sms.templateId);
const indianPhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : '';
};

// The OTP route is intentionally not reused. Receipt links need an approved
// Fast2SMS DLT service template with one URL variable.
async function sendBillSms(phone: string, invoiceId: string) {
  const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: config.sms.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'dlt', sender_id: config.sms.senderId, message: config.sms.templateId,
      variables_values: customerBillUrl(invoiceId), numbers: phone }),
    signal: AbortSignal.timeout(15_000)
  });
  const result = await response.json().catch(() => ({})) as { return?: boolean; request_id?: string };
  if (!response.ok || result.return !== true || !result.request_id) {
    throw Object.assign(new Error('sms_provider_rejected'), { code: 'sms_provider_rejected', permanent: response.status < 500 });
  }
  return result.request_id;
}

// Claim before sending. Ambiguous timeouts are marked unknown for review.
export async function deliverBillSms(db: Firestore, eventId: string) {
  if (!billSmsReady()) return { status: 'awaiting_provider' };
  const ref = db.collection('erp_syncLog').doc(eventId);
  const claim = await db.runTransaction(async tx => {
    const snap = await tx.get(ref), event = snap.data();
    if (!event || event.event !== 'sms_bill_delivery' || ['sent', 'consent_missing', 'unknown'].includes(event.status)) return null;
    if (event.status === 'processing') {
      if (event.leaseUntil?.toMillis() > Date.now()) return null;
      tx.update(ref, { status: 'unknown', error: 'worker_interrupted', updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    tx.update(ref, { status: 'processing', leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
    return { invoiceId: String(event.invoiceId || '') };
  });
  if (!claim) return { status: 'skipped' };
  try {
    const snap = await db.collection('erp_invoices').doc(claim.invoiceId).get();
    const phone = indianPhone(snap.data()?.customerPhone);
    if (!snap.exists || !phone) {
      await ref.update({ status: 'failed', error: 'invalid_invoice_or_phone', leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
      return { status: 'failed' };
    }
    const providerMessageId = await sendBillSms(phone, claim.invoiceId);
    await ref.update({ status: 'sent', providerMessageId, leaseUntil: null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { status: 'sent', providerMessageId };
  } catch (error) {
    const status = (error as { permanent?: boolean }).permanent ? 'failed' : 'unknown';
    await ref.update({ status, error: String((error as { code?: string }).code || 'provider_outcome_unknown'),
      leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
    return { status };
  }
}
