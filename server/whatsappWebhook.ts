import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { config } from './config.js';
import { firebase } from './firebase.js';
import { mobileNumber } from '../shared/customers.js';
import { sendPdf, whatsappReplyReady } from './whatsapp.js';

const path = '/api/webhooks/whatsapp';
const payload = z.object({ entry: z.array(z.object({
  changes: z.array(z.object({ field: z.string(), value: z.object({
    metadata: z.object({ phone_number_id: z.string() }).optional(),
    messages: z.array(z.object({
      id: z.string().min(1).max(512), from: z.string(), timestamp: z.string(),
      type: z.string(), text: z.object({ body: z.string() }).optional()
    })).max(50).optional()
  }) })).max(50)
})).max(50) });

export const whatsappWebhook = Router();
whatsappWebhook.get(path, (req, res) => {
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!whatsappReplyReady() || req.query['hub.mode'] !== 'subscribe' ||
      typeof token !== 'string' || typeof challenge !== 'string' || !/^\d{1,32}$/.test(challenge)) {
    res.sendStatus(403);
    return;
  }
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(token), digest(config.whatsapp.verifyToken))) {
    res.sendStatus(403);
    return;
  }
  res.type('text/plain').send(challenge);
});

whatsappWebhook.post(path, express.raw({ type: 'application/json', limit: '128kb' }), async (req, res) => {
  if (!whatsappReplyReady()) { res.sendStatus(503); return; }
  const signature = req.get('x-hub-signature-256') || '';
  if (!Buffer.isBuffer(req.body) || !/^sha256=[a-f0-9]{64}$/.test(signature)) { res.sendStatus(401); return; }
  const expected = createHmac('sha256', config.whatsapp.appSecret).update(req.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) { res.sendStatus(401); return; }

  let input: unknown;
  try { input = JSON.parse(req.body.toString('utf8')); }
  catch { res.sendStatus(400); return; }
  const parsed = payload.safeParse(input);
  if (!parsed.success) { res.sendStatus(400); return; }

  try {
    for (const entry of parsed.data.entry) {
      for (const { field, value } of entry.changes) {
        if (field !== 'messages' || value.metadata?.phone_number_id !== config.whatsapp.phoneNumberId) continue;
        for (const message of value.messages || []) {
          const invoiceId = message.type === 'text' && /^BILL (BOG-[\w.-]{1,80})$/i.exec(message.text?.body.trim() || '')?.[1];
          const age = Date.now() - Number(message.timestamp) * 1000;
          const sender = mobileNumber('+' + message.from);
          if (!invoiceId || !sender || !Number.isFinite(age) || age < -60_000 || age >= 86_400_000) continue;

          const db = firebase().db;
          const invoice = (await db.collection('erp_invoices').doc(invoiceId).get()).data();
          if (!invoice || mobileNumber(invoice.customerPhone) !== sender) continue;
          const key = createHash('sha256').update(message.id).digest('hex');
          const log = db.collection('erp_syncLog').doc('wa_reply_' + key);
          const claimed = await db.runTransaction(async tx => {
            if ((await tx.get(log)).exists) return false;
            tx.create(log, { event: 'whatsapp_receipt_reply', invoiceId, status: 'processing', createdAt: FieldValue.serverTimestamp() });
            return true;
          });
          if (!claimed) continue;
          let providerMessageId: string;
          try {
            providerMessageId = await sendPdf({ ...invoice, id: invoiceId, customerPhone: sender }, true);
          } catch {
            await log.update({ status: 'unknown', updatedAt: FieldValue.serverTimestamp() });
            continue;
          }
          await log.update({ status: 'sent', providerMessageId, updatedAt: FieldValue.serverTimestamp() });
        }
      }
    }
    res.sendStatus(200);
  } catch {
    res.sendStatus(503);
  }
});
