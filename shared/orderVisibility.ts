type OrderState = { id?: unknown; status?: unknown; shipmentStatus?: unknown; cancelledAt?: unknown; canceledAt?: unknown; createdBy?: unknown; channel?: unknown };
export function isCancelledOrder(order: OrderState) {
  const cancelled = (value: unknown) => ['cancelled', 'canceled'].includes(String(value || '').trim().toLowerCase());
  return Boolean(order.cancelledAt || order.canceledAt) || cancelled(order.status) || cancelled(order.shipmentStatus);
}
export function isHiddenWebsiteOrder(order: OrderState) {
  const pos = order.createdBy === 'admin-pos' || String(order.channel).toLowerCase() === 'pos' || /^(POS|EX)-/.test(String(order.id || ''));
  return !pos && isCancelledOrder(order);
}
