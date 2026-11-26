import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { commerceRouter } from '../server/commerce.js';
import { priceBillLine } from '../shared/billPricing.js';
import { customerKey } from '../server/customerIdentity.js';

const db = getFirestore(initializeApp({ projectId: 'demo-pos-pricing' }, 'brothers-admin'));
const { records } = memoryFirestore(db);
let role = 'owner';
const app = express();
app.use(express.json(), (_req, res, next) => { res.locals.owner = { uid: 'test-owner', role }; next(); }, commerceRouter);
const server = app.listen(0, '127.0.0.1');
let base = '', productId = '';
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => { mock.restoreAll(); error ? reject(error) : resolve(); })));
async function post(path: string, body: unknown) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const input = { requestId: 'pos-price-create-01', name: 'Custom price shirt', sku: 'CUSTOM-SHIRT', category: 'Shirts',
  mrp: 1000, salePrice: 800, costPrice: 400, customPrice: 650,
  variants: [{ size: 'M', color: 'Black', stock: 10, price: 800, costPrice: 400 }] };

test('create keeps custom price private and returns it to POS', async () => {
  const result = await post('/products/create', input);
  assert.equal(result.status, 201, JSON.stringify(result.body)); productId = result.body.productId;
  const product = records.get(`products/${productId}`)!;
  assert.equal(product.salePrice, 800); assert.equal(product.customPrice, undefined);
  assert.equal(product.variants[0].price, 800); assert.equal(product.variants[0].customPrice, undefined);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 650);
  const catalog = await (await fetch(base + '/products')).json();
  assert.equal(catalog.items[0].customPrice, 650);
  assert.equal((await post('/products/create', { ...input, requestId: 'invalid-pos-price-01', customPrice: 1001 })).status, 422);
  assert.equal((await post('/products/create', { ...input, requestId: 'invalid-pos-price-02', customPrice: -1 })).status, 422);
});

test('POS custom price posts correct totals and owner can override it for one bill', async () => {
  const sku = records.get(`products/${productId}`)!.variants[0].sku;
  const sale = { customerName: 'Test Buyer', customerPhone: '8765432109', paymentMethod: 'cash',
    lines: [{ productId, sku, quantity: 2 }] };
  role = 'cashier';
  const standard = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-01', expectedTotal: 1300 });
  assert.equal(standard.status, 201, JSON.stringify(standard.body)); assert.equal(standard.body.total, 1300);
  const pricing = priceBillLine(2, 1000, 650, 'price');
  const cashier = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-02', lines: [{ productId, sku, quantity: 2, price: 1000, discount: pricing.discount }], expectedTotal: 1300 });
  assert.equal(cashier.status, 201, JSON.stringify(cashier.body));
  role = 'owner';
  const edited = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-03', lines: [{ productId, sku, quantity: 2, price: 1000, discount: 800 }], expectedTotal: 1200 });
  assert.equal(edited.status, 201, JSON.stringify(edited.body)); assert.equal(edited.body.total, 1200);
  assert.equal(records.get(`products/${productId}`)?.salePrice, 800);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 650);
});

test('patch validates, updates and clears the private price without changing website pricing', async () => {
  const patch = (requestId: string, changes: object) => post('/products/patch', { requestId, productId, patch: changes });
  assert.equal((await patch('custom-price-patch-01', { customPrice: 700 })).status, 200);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 700);
  assert.equal((await patch('custom-price-patch-02', { customPrice: 1001 })).status, 422);
  assert.equal((await patch('custom-price-patch-03', { mrp: 600, salePrice: 500 })).status, 422);
  assert.equal((await patch('custom-price-patch-04', { customPrice: null })).status, 200);
  const catalog = await (await fetch(base + '/products')).json();
  assert.equal(catalog.items[0].customPrice, null); assert.equal(catalog.items[0].price, 800);
});

test('cost prices stay out of the public products collection', async () => {
  const product = records.get(`products/${productId}`)!;
  for (const field of ['costPrice', 'cost_price', 'purchasePrice', 'purchase_price']) {
    assert.equal(product[field], undefined, field);
    assert.equal(product.variants[0][field], undefined, `variant ${field}`);
  }
  const sku = product.variants[0].sku;
  assert.equal(records.get(`erp_productCostPrices/${productId}`)?.costPrice, 400);
  assert.equal(records.get(`erp_productCostPrices/${productId}`)?.variants[0].sku, sku);
  // Owners still see the cost in the POS; cashiers never do.
  const owner = await (await fetch(base + '/products')).json();
  assert.equal(owner.items[0].costPrice, 400); assert.equal(owner.items[0].variants[0].costPrice, 400);
  role = 'cashier';
  const cashier = await (await fetch(base + '/products')).json();
  assert.equal(cashier.items[0].costPrice, undefined); assert.equal(cashier.items[0].variants[0].costPrice, undefined);
  role = 'owner';
  // Editing a cost updates only the private record, and sales still record cost of goods.
  const patched = await post('/products/patch', { requestId: 'private-cost-patch-01', productId,
    patch: { costPrice: 420, variantPatches: [{ sku, size: 'M', color: 'Black', price: 800, costPrice: 410 }] } });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  assert.equal(records.get(`products/${productId}`)?.costPrice, undefined);
  assert.equal(records.get(`products/${productId}`)?.variants[0].costPrice, undefined);
  assert.equal(records.get(`erp_productCostPrices/${productId}`)?.costPrice, 420);
  assert.equal(records.get(`erp_productCostPrices/${productId}`)?.variants[0].costPrice, 410);
  const sale = await post('/pos/sale', { requestId: 'private-cost-sale-01', customerName: 'Test Buyer', customerPhone: '8765432109', paymentMethod: 'cash', lines: [{ productId, sku, quantity: 1 }] });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const order = records.get(`orders/${sale.body.orderId}`)!;
  assert.equal(order.items[0].unitCost, 410); assert.equal(order.items[0].costSource, 'variant_cost');
});

test('legacy public cost fields are still used until migrated, then removed on edit', async () => {
  records.set('products/legacy-cost', { name: 'Legacy shirt', sku: 'LEGACY', salePrice: 500, price: 500, mrp: 600,
    costPrice: 250, cost_price: 250, purchasePrice: 250, purchase_price: 250, stock: 3, quantity: 3, reserved: 0,
    variants: [{ sku: 'LEGACY-M', size: 'M', color: 'Blue', stock: 3, quantity: 3, reserved: 0, price: 500, mrp: 600, costPrice: 240, cost_price: 240 }] });
  const catalog = await (await fetch(base + '/products')).json();
  const legacy = catalog.items.find((item: { id: string }) => item.id === 'legacy-cost');
  assert.equal(legacy.costPrice, 250); assert.equal(legacy.variants[0].costPrice, 240);
  const edited = await post('/products/patch', { requestId: 'legacy-cost-patch-01', productId: 'legacy-cost', patch: { name: 'Legacy shirt v2' } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const product = records.get('products/legacy-cost')!;
  assert.equal(product.costPrice, undefined); assert.equal(product.purchase_price, undefined);
  assert.equal(product.variants[0].costPrice, undefined); assert.equal(product.variants[0].cost_price, undefined);
  assert.equal(records.get('erp_productCostPrices/legacy-cost')?.costPrice, 250);
  assert.equal(records.get('erp_productCostPrices/legacy-cost')?.variants[0].costPrice, 240);
});

test('a gift item is free on the bill and resets the customer coins to 0', async () => {
  const created = await post('/products/create', { requestId: 'gift-create-01', name: 'Gift wallet', sku: 'GIFT-WALLET', category: 'Gifts',
    mrp: 300, salePrice: 300, costPrice: 120, giftItem: true, variants: [{ size: 'Free', color: 'Brown', stock: 5, price: 300, costPrice: 120 }] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const giftId = created.body.productId;
  assert.equal(records.get(`products/${giftId}`)?.giftItem, true);
  const giftSku = records.get(`products/${giftId}`)!.variants[0].sku;
  const shirtSku = records.get(`products/${productId}`)!.variants[0].sku;
  const phone = '9123456780', account = `erp_loyaltyAccounts/${customerKey(phone, '')}`;
  records.set(account, { balance: 250 });
  // A gift needs a known customer.
  const anonymous = await post('/pos/sale', { requestId: 'gift-sale-00', paymentMethod: 'cash', lines: [{ productId: giftId, sku: giftSku, quantity: 1 }] });
  assert.equal(anonymous.status, 422);
  // Cashiers can give gifts; whatever price the screen sends, the gift line is free.
  role = 'cashier';
  const sale = await post('/pos/sale', { requestId: 'gift-sale-01', customerName: 'Coin Customer', customerPhone: phone, paymentMethod: 'cash',
    lines: [{ productId: giftId, sku: giftSku, quantity: 1, price: 300, discount: 300 }, { productId, sku: shirtSku, quantity: 1 }] });
  role = 'owner';
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const order = records.get(`orders/${sale.body.orderId}`)!;
  const giftLine = order.items.find((item: { sku: string }) => item.sku === giftSku);
  assert.equal(giftLine.gift, true); assert.equal(giftLine.amount, 0);
  assert.equal(order.totalAmount, sale.body.total);
  assert.equal(order.rewards.redeemed, 250); assert.equal(order.rewards.earned, 0);
  assert.equal(order.rewards.balance, 0); assert.equal(order.rewards.giftCoinsReset, true);
  assert.equal(records.get(account)?.balance, 0);
  assert.equal(records.get(`products/${giftId}`)!.variants[0].stock, 4);
});
