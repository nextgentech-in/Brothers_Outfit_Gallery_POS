import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { customerKey } from './customerIdentity.js';
import { idempotent } from './transactions.js';
import { appendCreditEntry, ledgerEntry, readCreditState } from './creditLedger.js';
import { deliverCustomerMessage, processCustomerMessages, queueCustomerMessage, whatsappConnectionStatus } from './customerMessages.js';
import { mobileNumber, shopDate, validBirthDate } from '../shared/customers.js';
import { creditSummary, validDueDate, type CreditCustomer } from '../shared/credit.js';

export const creditRouter = Router();
const identity = z.string().regex(/^(phone|email)_[a-f0-9]{64}$/);
const requestId = z.string().min(12).max(128).regex(/^[\w.:-]+$/);
const amount = z.number().finite().min(0).max(10_000_000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Use at most two decimal places.');
const dueDate = z.string().refine(value => validDueDate(value) && value >= shopDate(), 'Choose a due date today or later.');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fail(res: Response, error: unknown) {
  const status = Number((error as { status?: number })?.status || 503);
  res.status(status >= 400 && status < 500 ? status : 503).json({ error: status < 500 ? (error as Error).message : 'Credit records are unavailable. No change was confirmed.' });
}
creditRouter.get('/credit/customers', async (_req, res) => {
  try {
    const db = firebase().db;
    const [profiles, ledger] = await Promise.all([db.collection('erp_customerProfiles').get(), db.collection('erp_customerLedger').get()]);
    const entries = ledger.docs.map(doc => ledgerEntry(doc.id, doc.data()));
    const grouped=new Map<string,typeof entries>();for(const entry of entries){const rows=grouped.get(entry.customerKey)||[];rows.push(entry);grouped.set(entry.customerKey,rows);}
    const profileKeys=new Set(profiles.docs.map(doc=>doc.id));
    const items: CreditCustomer[] = profiles.docs.map(doc => ({ customerKey: doc.id, name: String(doc.data().name || 'Customer'),
      phone: String(doc.data().phone || ''), dateOfBirth: String(doc.data().dateOfBirth || ''), creditWhatsAppOptIn: doc.data().creditWhatsAppOptIn === true,
      summary: creditSummary(grouped.get(doc.id)||[]) }));
    for (const key of new Set(entries.map(entry => entry.customerKey))) {
      if (profileKeys.has(key)) continue;
      const summary = creditSummary(grouped.get(key)||[]);
      if (summary.given > 0) items.push({ customerKey: key, name: 'Customer profile missing', phone: '', dateOfBirth: '',
        creditWhatsAppOptIn: false, profileAvailable: false, summary });
    }
    res.json({ items: items.sort((a, b) => b.summary.balance - a.summary.balance || a.name.localeCompare(b.name)) });
  } catch (error) { fail(res, error); }
});
creditRouter.get('/credit/customers/:customerKey', async (req, res) => {
  const key = identity.safeParse(req.params.customerKey);
  if (!key.success) { res.status(422).json({ error: 'Select a customer.' }); return; }
  try {
    const db = firebase().db;
    const [profile, history] = await Promise.all([db.collection('erp_customerProfiles').doc(key.data).get(),
      db.collection('erp_customerLedger').where('customerKey', '==', key.data).get()]);
    if (!profile.exists && history.empty) { res.status(404).json({ error: 'Customer not found.' }); return; }
    const entries = history.docs.map(doc => ledgerEntry(doc.id, doc.data())).filter(entry => entry.creditDelta !== 0);
    res.json({ customer: { customerKey: key.data, name: profile.exists ? profile.data()?.name || 'Customer' : 'Customer profile missing', profileAvailable: profile.exists, phone: profile.data()?.phone || '',
      creditWhatsAppOptIn: profile.data()?.creditWhatsAppOptIn === true, dateOfBirth: profile.data()?.dateOfBirth || '', summary: creditSummary(entries) },
      entries: entries.sort((a, b) => (b.sequence || 0) - (a.sequence || 0) || (b.createdAt || '').localeCompare(a.createdAt || '')) });
  } catch (error) { fail(res, error); }
});
const createSchema = z.object({ requestId, name: z.string().trim().min(1).max(120), phone: z.string().max(20).refine(value => Boolean(mobileNumber(value)), 'Enter a valid mobile number.'),
  dateOfBirth: z.string().refine(value => validBirthDate(value), 'Enter a valid date of birth.'),
  openingAmount: amount.default(0), dueDate: dueDate.optional(), creditWhatsAppOptIn: z.boolean().default(false) }).strict()
  .refine(value => !value.openingAmount || Boolean(value.dueDate), 'A due date is required for opening credit.');
creditRouter.post('/credit/customers', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0].message }); return; }
  const input = parsed.data;
  try {
    const db = firebase().db, key = customerKey(input.phone, ''), eventId = `customer_${hash(input.requestId)}`;
    const result = await idempotent(db, 'credit_customer', input.requestId, input, async tx => {
      const profileRef = db.collection('erp_customerProfiles').doc(key);
      const profile = await tx.get(profileRef);
      if (profile.exists) throw Object.assign(new Error('This mobile number already has a customer profile. Select that customer to add credit.'), { status: 409 });
      const state = await readCreditState(db, tx, key);
      tx.create(profileRef, { customerKey: key, name: input.name, phone: mobileNumber(input.phone), dateOfBirth: input.dateOfBirth,
        creditWhatsAppOptIn: input.creditWhatsAppOptIn, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      const summary = input.openingAmount ? appendCreditEntry(db, tx, state, `opening_${hash(input.requestId)}`, {
        kind: 'credit', creditDelta: input.openingAmount, dueDate: input.dueDate!, note: 'Opening udhar', paymentMethod: 'credit'
      }) : state.summary;
      queueCustomerMessage(db, tx, eventId, { customerKey: key, name: input.name, phone: mobileNumber(input.phone),
        action: input.openingAmount ? 'Account created with opening credit' : 'Customer account created', amount: input.openingAmount,
        balance: summary.balance, dueDate: summary.nextDueDate || '', consent: input.creditWhatsAppOptIn });
      return { customerKey: key, balance: summary.balance };
    });
    const message = await deliverCustomerMessage(db, eventId).catch(() => ({ status: 'pending' }));
    res.status(201).json({ ...result, message });
  } catch (error) { fail(res, error); }
});
const entrySchema = z.object({ requestId, customerKey: identity, kind: z.enum(['credit', 'payment']), amount: amount.refine(n => n > 0, 'Enter an amount greater than zero.'),
  dueDate: dueDate.optional(), note: z.string().trim().max(300).default(''), paymentMethod: z.enum(['cash', 'upi', 'card']).optional() }).strict()
  .refine(value => value.kind !== 'credit' || Boolean(value.dueDate), 'A due date is required for credit.')
  .refine(value => value.kind !== 'payment' || Boolean(value.paymentMethod), 'Choose how the payment was received.');
creditRouter.post('/credit/entries', async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0].message }); return; }
  const input = parsed.data;
  try {
    const db = firebase().db, eventId = `credit_${hash(input.requestId)}`;
    const result = await idempotent(db, 'credit_entry', input.requestId, input, async tx => {
      const profile = await tx.get(db.collection('erp_customerProfiles').doc(input.customerKey));
      if (!profile.exists) throw Object.assign(new Error('Customer not found.'), { status: 404 });
      const state = await readCreditState(db, tx, input.customerKey);
      if (input.kind === 'payment' && Math.round(input.amount * 100) > Math.round(state.summary.balance * 100))
        throw Object.assign(new Error('Payment cannot exceed the outstanding balance.'), { status: 422 });
      const summary = appendCreditEntry(db, tx, state, eventId, { kind: input.kind,
        creditDelta: input.kind === 'payment' ? -input.amount : input.amount, dueDate: input.kind === 'credit' ? input.dueDate! : '',
        note: input.note, paymentMethod: input.paymentMethod || 'credit' });
      queueCustomerMessage(db, tx, eventId, { customerKey: input.customerKey, name: profile.data()?.name || 'Customer', phone: profile.data()?.phone || '',
        action: input.kind === 'payment' ? 'Payment received' : 'Credit added', amount: input.amount, balance: summary.balance,
        dueDate: summary.nextDueDate || '', consent: profile.data()?.creditWhatsAppOptIn === true });
      return { balance: summary.balance, entryId: eventId };
    });
    const message = await deliverCustomerMessage(db, eventId).catch(() => ({ status: 'pending' }));
    res.status(201).json({ ...result, message });
  } catch (error) { fail(res, error); }
});
creditRouter.post('/credit/preferences', async (req, res) => {
  const parsed = z.object({ requestId, customerKey: identity, creditWhatsAppOptIn: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Select a customer and notification preference.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    res.json(await idempotent(db, 'credit_preferences', input.requestId, input, async tx => {
      const ref = db.collection('erp_customerProfiles').doc(input.customerKey), doc = await tx.get(ref);
      if (!doc.exists) throw Object.assign(new Error('Customer not found.'), { status: 404 });
      tx.update(ref, { creditWhatsAppOptIn: input.creditWhatsAppOptIn, updatedAt: FieldValue.serverTimestamp() });
      return { updated: true };
    }));
  } catch (error) { fail(res, error); }
});

creditRouter.get('/whatsapp/status', async (_req, res) => {
  const status = await whatsappConnectionStatus();
  try {
    const docs = await firebase().db.collection('erp_customerMessages').orderBy('createdAt', 'desc').limit(60).get();
    res.json({ ...status, historyAvailable: true, messages: docs.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, name: data.name, phone: data.phone, action: data.action, amount: data.amount, balance: data.balance,
        dueDate: data.dueDate, status: data.status, attempts: data.attempts, error: data.error || '', createdAt: data.createdAt?.toDate?.()?.toISOString() || null };
    }) });
  } catch { res.json({ ...status, historyAvailable: false, messages: [] }); }
});
creditRouter.post('/whatsapp/process', async (_req, res) => {
  try { res.json(await processCustomerMessages(firebase().db)); } catch (error) { fail(res, error); }
});
creditRouter.post('/whatsapp/retry', async (req, res) => {
  const parsed = z.object({ eventId: z.string().regex(/^(customer|credit)_[a-f0-9]{64}$/) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Select a failed customer message.' }); return; }
  try {
    const db = firebase().db, ref = db.collection('erp_customerMessages').doc(parsed.data.eventId);
    await db.runTransaction(async tx => {
      const event = await tx.get(ref);
      if (event.data()?.status !== 'failed') throw Object.assign(new Error('Only a confirmed rejected message can be retried.'), { status: 409 });
      tx.update(ref, { status: 'pending', error: null, updatedAt: FieldValue.serverTimestamp() });
    });
    res.json(await deliverCustomerMessage(db, parsed.data.eventId));
  } catch (error) { fail(res, error); }
});
