import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { config } from './config.js';
import { mobileNumber } from '../shared/customers.js';

export const customerMessagesReady = () => /^v\d+\.\d+$/.test(config.whatsapp.graphVersion) &&
  /^\d+$/.test(config.whatsapp.phoneNumberId) && Boolean(config.whatsapp.accessToken && config.whatsapp.creditTemplateName);
export function queueCustomerMessage(db: Firestore, tx: Transaction, id: string, details: {
  customerKey: string; name: string; phone: string; action: string; amount: number; balance: number; dueDate: string; consent: boolean;
}) {
  tx.create(db.collection('erp_customerMessages').doc(id), { ...details, status: details.consent ? 'pending' : 'consent_missing',
    attempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}
export async function deliverCustomerMessage(db: Firestore, id: string) {
  if (!customerMessagesReady()) return { status: 'pending', reason: 'provider_not_configured' };
  const ref = db.collection('erp_customerMessages').doc(id);
  const claim = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), event = snapshot.data();
    if (!event) return null;
    if (event.status === 'processing') {
      if (Number(event.leaseUntil?.toMillis?.() || 0) <= Date.now())
        tx.update(ref, { status: 'unknown', error: 'worker_interrupted', updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    if (event.status !== 'pending') return null;
    const profile = await tx.get(db.collection('erp_customerProfiles').doc(String(event.customerKey)));
    if (!event.consent || profile.data()?.creditWhatsAppOptIn !== true || !mobileNumber(String(event.phone || ''))) {
      tx.update(ref, { status: 'consent_missing', updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: 'processing', attempts: Number(event.attempts || 0) + 1,
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
    return event;
  });
  if (!claim) return { status: 'skipped' };
  try {
    const response = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: mobileNumber(claim.phone), type: 'template',
        template: { name: config.whatsapp.creditTemplateName, language: { code: config.whatsapp.templateLanguage }, components: [
          { type: 'body', parameters: [claim.name || 'Customer', claim.action, `INR ${Number(claim.amount).toFixed(2)}`,
            `INR ${Number(claim.balance).toFixed(2)}`, claim.dueDate || (Number(claim.balance) > 0 ? 'Contact the shop for the due date' : 'No payment due')].map(text => ({ type: 'text', text })) }
        ] } }), signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'provider_auth_failed' : `provider_http_${response.status}`;
      // A provider rejection is safe to retry deliberately. Ambiguous 5xx/timeouts require review.
      throw Object.assign(new Error(code), { knownRejection: response.status < 500 });
    }
    const body = await response.json() as { messages?: { id?: string }[] };
    const messageId = body.messages?.[0]?.id;
    if (!messageId) throw new Error('provider_outcome_unknown');
    await ref.update({ status: 'accepted', providerMessageId: messageId, error: null, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
    return { status: 'accepted' };
  } catch (error) {
    const status = (error as { knownRejection?: boolean }).knownRejection ? 'failed' : 'unknown';
    await ref.update({ status, error: status === 'failed' ? (error as Error).message : 'provider_outcome_unknown', leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
    return { status };
  }
}
export async function processCustomerMessages(db: Firestore) {
  if (!customerMessagesReady()) return { processed: 0, configured: false };
  const pending = await db.collection('erp_customerMessages').where('status', 'in', ['pending', 'processing']).limit(20).get();
  for (const doc of pending.docs) await deliverCustomerMessage(db, doc.id);
  return { processed: pending.size, configured: true };
}

export async function whatsappConnectionStatus() {
  const required = { WA_GRAPH_VERSION: /^v\d+\.\d+$/.test(config.whatsapp.graphVersion),
    WA_PHONE_NUMBER_ID: /^\d+$/.test(config.whatsapp.phoneNumberId), WA_ACCESS_TOKEN: Boolean(config.whatsapp.accessToken),
    WA_CREDIT_TEMPLATE_NAME: Boolean(config.whatsapp.creditTemplateName), WA_TEMPLATE_NAME: Boolean(config.whatsapp.templateName),
    WA_BUSINESS_ACCOUNT_ID: /^\d+$/.test(config.whatsapp.businessAccountId) };
  const base = { configured: customerMessagesReady(), requirements: required,
    templateName: config.whatsapp.creditTemplateName, receiptTemplateName: config.whatsapp.templateName,
    language: config.whatsapp.templateLanguage, businessWritesEnabled: true,
    checkedAt: new Date().toISOString() };
  if (!required.WA_GRAPH_VERSION || !required.WA_PHONE_NUMBER_ID || !required.WA_ACCESS_TOKEN)
    return { ...base, connection: 'not_configured', templateStatus: 'not_checked' };
  const headers = { Authorization: `Bearer ${config.whatsapp.accessToken}` };
  try {
    const response = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ...base, connection: 'error', error: `provider_http_${response.status}`, templateStatus: 'not_checked' };
    const phone = await response.json() as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
    let templateStatus = 'not_checked';
    if (required.WA_BUSINESS_ACCOUNT_ID && required.WA_CREDIT_TEMPLATE_NAME) {
      const templates = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.businessAccountId}/message_templates?name=${encodeURIComponent(config.whatsapp.creditTemplateName)}&fields=name,status,language`, { headers, signal: AbortSignal.timeout(10_000) });
      if (templates.ok) {
        const body = await templates.json() as { data?: { name: string; status: string; language: string }[] };
        templateStatus = body.data?.find(t => t.name === config.whatsapp.creditTemplateName && t.language === config.whatsapp.templateLanguage)?.status || 'not_found';
      } else templateStatus = 'check_failed';
    }
    return { ...base, connection: 'connected', displayPhone: phone.display_phone_number || '', businessName: phone.verified_name || '', quality: phone.quality_rating || '', templateStatus };
  } catch { return { ...base, connection: 'error', error: 'connection_unavailable', templateStatus: 'not_checked' }; }
}
