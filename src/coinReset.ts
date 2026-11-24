import type { Customer } from '../shared/customers';

export type CoinResetChoice = { coins?: number; label: string };

/** Asks full vs partial reset. Returns null when cancelled. */
export function askCoinReset(customer: Customer): CoinResetChoice | null {
  const name = customer.fullName || customer.phone, balance = customer.coinBalance || 0;
  const answer = window.prompt(`${name} has ${balance.toLocaleString('en-IN')} coins.\n\nType ALL for a full reset to 0,\nor type a number of coins to remove (partial reset):`, 'ALL');
  if (answer === null) return null;
  const text = answer.trim();
  if (/^all$/i.test(text)) {
    return window.confirm(`Full reset: set ${name}'s ${balance.toLocaleString('en-IN')} coins to 0? This cannot be undone.`) ? { label: `Coins reset to 0 for ${name}.` } : null;
  }
  const coins = Number(text);
  if (!Number.isInteger(coins) || coins <= 0) { window.alert('Enter ALL or a whole number of coins greater than 0.'); return null; }
  const removed = Math.min(coins, balance), left = balance - removed;
  return window.confirm(`Partial reset: remove ${removed.toLocaleString('en-IN')} coins from ${name}? ${left.toLocaleString('en-IN')} coins will remain.`)
    ? { coins: removed, label: `${removed.toLocaleString('en-IN')} coins removed for ${name}. ${left.toLocaleString('en-IN')} left.` } : null;
}
