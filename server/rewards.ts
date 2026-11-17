import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { noRewards } from '../shared/rewards.js';

const decimal = z.number().finite().min(0).refine(number => Math.abs(number * 100 - Math.round(number * 100)) < 0.00001);
export const rewardRuleSchema = z.object({
  rate: decimal.refine(number => number <= 100),
  minimum: decimal.refine(number => number <= 10_000_000)
}).strict();

export function configuredRewardRule(value: unknown) {
  const parsed = rewardRuleSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function rewardRule(value: unknown) {
  return configuredRewardRule(value) ?? noRewards;
}

export function rewardDefaults(db: Firestore) {
  return db.collection('erp_loyaltySettings').doc('defaults');
}

export function rewardAccount(db: Firestore, identity: string) {
  return db.collection('erp_loyaltyAccounts').doc(identity);
}

export async function readRewardBalance(db: Firestore, tx: Transaction, identity: string) {
  const ref = rewardAccount(db, identity);
  return { ref, balance: Number((await tx.get(ref)).data()?.balance || 0) };
}

export function writeRewardBalance(tx: Transaction, state: Awaited<ReturnType<typeof readRewardBalance>>, delta: number) {
  const balance = state.balance + delta;
  if (delta) tx.set(state.ref, { balance, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return Math.max(0, balance);
}
