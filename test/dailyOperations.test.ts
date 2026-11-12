import { purchaseCsv } from '../shared/purchaseCsv.js';
import { localizedDraft } from '../shared/whatsappDraft.js';
import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { purchasesRouter } from '../server/purchases.js';
import { operationsRouter } from '../server/operations.js';
import { commerceRouter } from '../server/commerce.js';
import { returnsRouter } from '../server/returns.js';
import { staffRouter, staffIdentity, currentStaff } from '../server/staff.js';
import { paymentBreakdown } from '../shared/payments.js';
import { returnAmounts } from '../shared/returns.js';
import { summarize } from '../shared/reports.js';
import { decodeBackup, encodeBackup, validateBackup, exportBusinessBackup } from '../server/backup.js';
import { invoicePdf } from '../server/invoicePdf.js';
import { dueDateAfter } from '../shared/credit.js';
import { shopDate } from '../shared/customers.js';
const db=getFirestore(initializeApp({projectId:'demo-daily-pos'},'brothers-admin'));
const {records}=memoryFirestore(db);
const app=express();app.use(express.json(),(_req,res,next)=>{res.locals.owner={uid:'test-owner',role:'owner'};next();},purchasesRouter,operationsRouter,commerceRouter,returnsRouter,staffRouter);
const server=app.listen(0,'127.0.0.1');let base='';
before(async()=>{if(!server.listening)await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a!=='string');base=`http://127.0.0.1:${a.port}`;records.set('erp_suppliers/supplier-1',{name:'Test supplier',active:true});});
after(()=>new Promise<void>((resolve,reject)=>server.close(e=>{mock.restoreAll();e?reject(e):resolve();})));
const post=async(path:string,payload:unknown)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};};
const purchase={requestId:'new-purchase-0001',supplierId:'supplier-1',supplierInvoice:'TEST-1',amountPaid:100,paymentMethod:'cash',lines:[{sku:'TEST-JEANS',quantity:4,unitCost:125.25,salePrice:250,mrp:300,newItem:{name:'Boot cut jeans',category:'Jeans',brand:'Test Brand',design:'12689',fabric:'Peach',size:'32',color:'Black'}}]};
let productId='';
test('immediate purchase creates a labelled catalog item and stock exactly once',async()=>{
 const r=await post('/purchases/receive',purchase);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.total,501);assert.equal(r.body.payable,401);productId=r.body.createdProductIds[0];const product=records.get(`products/${productId}`)!;assert.equal(product.stock,4);assert.equal(product.variants[0].stock,4);assert.equal(product.brand,'Test Brand');assert.equal(product.mrp,300);assert.equal(product.active,false);
 assert.equal((await post('/purchases/receive',purchase)).status,201);assert.equal(records.get(`products/${productId}`)?.stock,4);
 assert.equal((await post('/purchases/receive',{...purchase,requestId:'duplicate-invoice-01'})).status,409);
 assert.equal((await post('/purchases/receive',{...purchase,requestId:'invalid-pricing-01',lines:[{...purchase.lines[0],salePrice:400}]})).status,422);
});
test('existing receipts use weighted cost; supplier payments cannot exceed balance',async()=>{
 const receipt={...purchase,requestId:'restock-existing-01',supplierInvoice:'TEST-2',amountPaid:0,lines:[{productId,sku:'TEST-JEANS-V1',quantity:4,unitCost:174.75,salePrice:250,mrp:300}]};
 assert.equal((await post('/purchases/receive',receipt)).status,201);assert.equal(records.get(`products/${productId}`)?.variants[0].costPrice,150);assert.equal(records.get(`products/${productId}`)?.stock,8);
 const payment={requestId:'supplier-payment-01',supplierId:'supplier-1',amount:1100,method:'upi'};assert.equal((await post('/suppliers/payment',payment)).status,200);assert.equal((await post('/suppliers/payment',payment)).status,200);
 assert.equal((await post('/suppliers/payment',{...payment,requestId:'supplier-overpay-01',amount:.01})).status,422);
});
test('awaiting purchase orders do not change stock before receipt',async()=>{
 const payload={...purchase,requestId:'ordered-purchase-01',supplierInvoice:'PO-1',amountPaid:0,mode:'order',lines:[{...purchase.lines[0],sku:'ORDERED-JEANS'}]};
 const r=await post('/purchases/receive',payload);assert.equal(r.status,201);assert.equal([...records.values()].filter(p=>p.sku==='ORDERED-JEANS').length,0);
 assert.equal((await post('/purchases/receive',{...payload,requestId:'duplicate-order-ref-01'})).status,409);
 const receive={requestId:'receive-purchase-01',orderId:r.body.orderId,amountPaid:10,paymentMethod:'upi'};assert.equal((await post('/purchases/receive-order',receive)).status,201);assert.equal((await post('/purchases/receive-order',receive)).status,201);assert.equal((await post('/purchases/receive-order',{...receive,requestId:'receive-duplicate-01'})).status,409);
});
test('split payments put only unpaid amount into udhar and retain cash change',async()=>{
 const sale={requestId:'split-sale-credit-01',lines:[{productId,sku:'TEST-JEANS-V1',quantity:1}],paymentMethod:'split',payments:[{method:'cash',amount:100},{method:'credit',amount:150}],cashTendered:200,customerName:'Test Customer',customerPhone:'9876543210',customerDateOfBirth:'1998-02-28',creditDueDate:dueDateAfter(7)};
 const r=await post('/pos/sale',sale);assert.equal(r.status,201,JSON.stringify(r.body));const invoice=records.get(`erp_invoices/${r.body.invoiceId}`)!;assert.equal(invoice.creditAmount,150);assert.equal(invoice.change,100);const accounts=[...records].filter(([k])=>k.startsWith('erp_creditAccounts/'));assert.equal(accounts[0][1].balance,150);
 assert.equal((await post('/pos/sale',{...sale,requestId:'bad-split-sale-01',payments:[{method:'cash',amount:99}]})).status,422);
});
test('GST-enabled stock does not add tax to the bill and cash plus UPI settles exactly',async()=>{
 const [path, product]=[...records].find(([key,value])=>key.startsWith('products/')&&value.sku==='ORDERED-JEANS')!;
 records.set(path,{...product,gstEnabled:true,gstPercent:5});
 const sale={requestId:'gst-split-sale-01',expectedTotal:250,lines:[{productId:path.slice('products/'.length),sku:'ORDERED-JEANS-V1',quantity:1,price:300,discount:50}],paymentMethod:'split',payments:[{method:'cash',amount:100},{method:'upi',amount:150}]};
 const result=await post('/pos/sale',sale);assert.equal(result.status,201,JSON.stringify(result.body));
 const invoice=records.get(`erp_invoices/${result.body.invoiceId}`)!;
 assert.equal(invoice.total,250);assert.equal(invoice.tax,0);assert.equal(invoice.lines[0].tax,0);assert.equal(invoice.lines[0].discount,50);assert.equal(invoice.lines[0].discountPercent,16.67);assert.equal(invoice.lines[0].amount,250);
 assert.deepEqual(invoice.payments,sale.payments);
 assert.equal((await post('/pos/sale',{...sale,requestId:'gst-tax-rejected-01',lines:[{...sale.lines[0],tax:12.5,taxPercent:5}]})).status,422);
 assert.equal((await post('/pos/sale',{...sale,requestId:'gst-mismatch-sale-01',expectedTotal:262.5})).status,409);
});
test('partial discounted returns, exchanges and refund retry preserve stock and money',async()=>{
 const r=await post('/pos/sale',{requestId:'paid-sale-return-01',lines:[{productId,sku:'TEST-JEANS-V1',quantity:3}],paymentMethod:'cash',discount:1});assert.equal(r.status,201,JSON.stringify(r.body));const original=records.get(`orders/${r.body.orderId}`)!;
 const amount=returnAmounts(original.items,original.totalAmount,{},[{index:0,quantity:1,restock:true}]);
 const payload={requestId:'partial-return-01',orderId:r.body.orderId,reason:'Size change',lines:[{index:0,quantity:1,restock:true}],replacements:[{productId,sku:'TEST-JEANS-V1',quantity:1}],expectedDifference:Math.round((250-amount)*100)/100,differenceMethod:'upi'};
 const returned=await post('/orders/return',payload);assert.equal(returned.status,201,JSON.stringify(returned.body));assert.equal(returned.body.amountToCollect,.33);assert.equal(records.get(`products/${productId}`)?.stock,4);assert.equal((await post('/orders/return',payload)).status,201);
 const rest=await post('/orders/return',{requestId:'remaining-return-01',orderId:r.body.orderId,reason:'Damaged items',lines:[{index:0,quantity:2,restock:false}]});assert.equal(rest.status,201,JSON.stringify(rest.body));assert.equal(rest.body.refundAmountToReview,499.33);assert.equal(records.get(`products/${productId}`)?.stock,4);
 const refund={requestId:'refund-recorded-01',returnId:rest.body.returnId,amount:499.33,method:'cash',reference:'Cash returned'};assert.equal((await post('/orders/refund',refund)).status,200);assert.equal((await post('/orders/refund',refund)).status,200);assert.equal((await post('/orders/refund',{...refund,requestId:'refund-excess-01',amount:.01})).status,422);
 assert.equal(records.get(`orders/${r.body.orderId}`)?.returnedAmount,749);
});
test('stock count needs no reason, rejects stale counts and preserves reservations',async()=>{
 const payload={requestId:'stock-count-test-01',productId,lines:[{sku:'TEST-JEANS-V1',expected:4,counted:5,threshold:2}]};assert.equal((await post('/inventory/count',payload)).status,200);assert.equal((await post('/inventory/count',{...payload,requestId:'stock-count-stale-01'})).status,409);assert.equal(records.get(`products/${productId}`)?.stock,5);
});
test('reports separate sales, credit collections, refunds and supplier cash; closing is immutable',async()=>{
 const r=await (await fetch(base+`/reports/summary?from=${shopDate()}&to=${shopDate()}`)).json();assert.ok(r.summary.billCount>=3);assert.equal(r.summary.cashSupplierPayments,100);assert.equal(r.summary.creditSales,150);
 const close={requestId:'day-closing-test-01',date:shopDate(),openingCash:1000,countedCash:1000};const first=await post('/day/close',close);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal((await post('/day/close',close)).status,200);assert.equal((await post('/day/close',{...close,requestId:'day-closing-again-01'})).status,409);
});
test('staff credentials are hashed, can be revoked, and changed retries are rejected',async()=>{
 const payload={requestId:'create-staff-test-01',name:'Test cashier',role:'cashier',pin:'7359',active:true};
 const saved=await post('/staff/save',payload);assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal((await post('/staff/save',payload)).status,200);
 assert.equal((await post('/staff/save',{...payload,pin:'7358'})).status,409);
 const identity=await staffIdentity('7359');assert.equal(identity?.role,'cashier');
 const staffRecord=records.get(`erp_staff/${saved.body.id}`)!;
 assert.equal(staffRecord.pin,undefined);assert.match(staffRecord.pinHash,/^[a-f0-9]{64}$/);
 assert.equal((await post('/staff/save',{...payload,id:saved.body.id,requestId:'revoke-staff-test-01',pin:undefined,active:false})).status,200);
 await assert.rejects(()=>currentStaff(identity!),/revoked/);
});
test('money helpers conserve every paisa and PDF keeps long invoices',()=>{
 assert.equal(paymentBreakdown(1500,'split',[{method:'cash',amount:500},{method:'upi',amount:1000}],1000).change,500);assert.throws(()=>paymentBreakdown(1500,'split',[{method:'cash',amount:500}]),/exactly/);
 assert.equal(paymentBreakdown(250,'split',[{method:'cash',amount:100},{method:'credit',amount:150}],200).creditAmount,150);
 assert.equal(paymentBreakdown(250,'split',[{method:'upi',amount:100},{method:'credit',amount:150}]).creditAmount,150);
 assert.deepEqual(paymentBreakdown(250,'split',[{method:'cash',amount:50},{method:'upi',amount:75},{method:'card',amount:25},{method:'credit',amount:100}]).payments.map(part=>part.amount),[50,75,25,100]);
 let sum=0;for(let i=0;i<3;i++)sum+=returnAmounts([{quantity:3,price:100}],299.99,{0:i},[{index:0,quantity:1,restock:true}]);assert.equal(Math.round(sum*100),29999);
 const pdf=invoicePdf({id:'long',total:60,lines:Array.from({length:60},(_,i)=>({name:`UNIQUEITEM${i}`,quantity:1,price:1}))}).toString();assert.match(pdf,/UNIQUEITEM59/);assert.match(pdf,/\/Count [2-9]/);
 assert.doesNotMatch(pdf,/DISCOUNT\s+GST\s+TOTAL/);
 const report=summarize([{status:'Processing',totalAmount:999,paymentMethod:'cash'},{status:'Delivered',totalAmount:200,payments:[{method:'cash',amount:50},{method:'credit',amount:150}]}],[{total:10}],[{kind:'payment',creditDelta:-20,paymentMethod:'cash'}],[{method:'cash',amount:10}],[{method:'cash',amount:5}],[{method:'cash',amount:15}]);assert.equal(report.netSales,190);assert.equal(report.cashMovement,40);
});
test('backup round trips timestamps, contains consistent business records and excludes credentials',async()=>{
 const timestamp=Timestamp.fromDate(new Date('2026-01-01'));assert.equal(decodeBackup(encodeBackup({timestamp})).timestamp.toMillis(),timestamp.toMillis());const backup=validateBackup(await exportBusinessBackup(db));assert.ok(backup.collections.products.length);assert.equal(backup.projectId,'demo-daily-pos');assert.equal(backup.collections.erp_staff,undefined);assert.throws(()=>validateBackup({format:'brothers-pos-business-v1',collections:{erp_staff:[]}}),/Unexpected/);
});

test('recovery locks unposted bill references and recognizes already posted sales',async()=>{
 const sale={requestId:'price-changed-sale-01',expectedTotal:100,lines:[{productId,sku:'TEST-JEANS-V1',quantity:1}],paymentMethod:'cash'};
 assert.equal((await post('/pos/sale',sale)).status,409);assert.equal((await post('/pos/recover',{requestId:sale.requestId})).body.state,'editable');
 assert.equal((await post('/pos/sale',{...sale,expectedTotal:250})).status,409);
 const posted=await post('/pos/recover',{requestId:'paid-sale-return-01'});assert.equal(posted.body.state,'posted');assert.ok(posted.body.invoiceId);
});

test('purchase CSV preserves quoted fields and rejects invalid prices before import',()=>{
 const csv='sku,name,category,size,color,quantity,unitCost,salePrice,mrp\nABC,"Shirt, cotton",Shirts,M,Black,3,100,200,300';assert.equal(purchaseCsv(csv)[0].newItem?.name,'Shirt, cotton');assert.throws(()=>purchaseCsv(csv.replace(',200,300',',400,300')),/row 2/);assert.throws(()=>purchaseCsv(csv.replace(',100,',',,')),/row 2/);
 assert.match(localizedDraft('hi','payment','Ravi','Shop','100.00','1 Dec',''),/बकाया राशि/);assert.match(localizedDraft('gu','birthday','Ravi','Shop','','',''),/જન્મદિવસ/);
});

test('bill search matches the same customer with or without country code',async()=>{
 const data=await (await fetch(base+'/orders/search?q=919876543210')).json();assert.ok(data.items.some((o:any)=>o.customerName==='Test Customer'));
});
