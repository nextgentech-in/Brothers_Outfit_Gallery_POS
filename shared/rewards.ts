export type RewardRule = { rate: number; minimum: number };
export type BillRewards = { earned: number; redeemed: number; balance: number; rule: RewardRule };

export const noRewards: RewardRule = { rate: 0, minimum: 0 };

export function earnedPoints(amount: number, rule: RewardRule) {
  const paise = Math.round(amount * 100);
  return paise >= Math.round(rule.minimum * 100)
    ? Math.floor(paise * Math.round(rule.rate * 100) / 1_000_000)
    : 0;
}

export function redeemablePoints(balance: number, amount: number) {
  return Math.max(0, Math.min(balance, Math.floor((Math.round(amount * 100) - 1) / 100)));
}
