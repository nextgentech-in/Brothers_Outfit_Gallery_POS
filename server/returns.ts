import { Router } from 'express';
import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { idempotent } from './transactions.js';
import { changeStock, fiscalYear } from './commerce.js';
import { appendCreditEntry, readCreditState } from './creditLedger.js';
import { returnAmounts } from '../shared/returns.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const id=z.string().min(1).max(128).regex(/^[\w.:-]+$/), money=z.number().finite().min(0).max(10000000);
const reject=(message:string,status=422):never=>{throw Object.assign(new Error(message),{status});};
const fail=(res:any,e:any)=>res.status(e.status||503).json({error:e.status?e.message:'Return result unconfirmed. Retry using the same reference.'});
export const returnsRouter=Router();
const schema=z.object({requestId:id.min(12),orderId:id,reason:z.string().trim().min(3).max(500),
 lines:z.array(z.object({index:z.number().int().min(0),quantity:z.number().int().min(1).max(10000),restock:z.boolean().default(true)}).strict()).min(1).max(30).optional(),
 replacements:z.array(z.object({productId:id,sku:id,quantity:z.number().int().min(1).max(10000)}).strict()).max(30).default([]),
 differenceMethod:z.enum(['cash','upi','card']).default('cash'),expectedDifference:z.number().finite().optional()}).strict();
returnsRouter.post('/orders/return',async(req,res)=>{
 const parsed=schema.safeParse(req.body);if(!parsed.success){res.status(422).json({error:'Choose return quantities, a reason and valid replacement items.'});return;}
 try{const db=firebase().db,input=parsed.data;res.status(201).json(await idempotent(db,'order_return',input.requestId,input,async tx=>{
  const orderRef=db.collection('orders').doc(input.orderId),returnId=input.lines?`RET-${hash(input.requestId).slice(0,24)}`:input.orderId;
  const returnRef=db.collection('erp_returns').doc(returnId),fy=fiscalYear(),counterRef=db.collection('erp_creditNoteSequences').doc(fy);
  const [orderSnap,prior,counter]=await tx.getAll(orderRef,returnRef,counterRef);
  if(prior.exists)return {orderId:input.orderId,returnId,creditNoteId:prior.data()?.creditNoteId,duplicateState:true};
  if(!orderSnap.exists)reject('Order not found.',404);const order=orderSnap.data()!;
  if(!['Delivered','Partially returned'].includes(order.status)||!order.inventoryDeducted)reject('Only delivered stock-deducted items can be returned.',409);
  const items=order.items as any[],previous=order.returnedQuantities||{};
  const selected=input.lines||items.flatMap((item,index)=>item.quantity>(previous[index]||0)?[{index,quantity:item.quantity-(previous[index]||0),restock:true}]:[]);
  let amount;try{amount=returnAmounts(items,Number(order.totalAmount),previous,selected);}catch(e){throw Object.assign(e as Error,{status:422});}
  const creditSale=order.paymentMethod==='credit'||Number(order.creditAmount)>0;
  if(creditSale&&input.replacements.length)reject('For a credit bill, record the return and settle its balance before creating a separate replacement bill.');
  const meta=creditSale?await tx.get(db.collection('erp_orderMeta').doc(input.orderId)):null;
  const state=meta?.data()?.customerKey?await readCreditState(db,tx,meta.data()!.customerKey):null;
  if(creditSale&&!state)reject('Credit customer link is missing. Restore the account link before returning this bill.',409);
  const creditCancelled=Math.min(amount,state?.summary.debts.find(d=>d.id===input.orderId)?.remaining||0);
  const invoiceCounter=db.collection('erp_invoiceSequences').doc(fy),invoiceSequence=input.replacements.length?await tx.get(invoiceCounter):null;
  const productIds=[...new Set([...selected.map(s=>String(items[s.index].productId||items[s.index].id||'')),...input.replacements.map(r=>r.productId)])].sort();
  const refs=productIds.map(p=>db.collection('products').doc(p)),snapshots=await tx.getAll(...refs),working=new Map<string,DocumentData>();
  snapshots.forEach((snap,i)=>{if(!snap.exists)reject('A selected product is unavailable.',409);working.set(productIds[i],snap.data()!);});
  const movements:DocumentData[]=[],returnedQuantities={...previous};
  selected.forEach((line,index)=>{const item=items[line.index],productId=String(item.productId||item.id),product=working.get(productId)!;
    const sku=item.sku||(!product.variants?.length?product.sku:product.variants.find((v:any)=>v.size===item.size&&v.color===item.color)?.sku);
    if(!sku)reject('The original variant could not be identified.',409);
    returnedQuantities[line.index]=(previous[line.index]||0)+line.quantity;
    if(line.restock){const changed=changeStock(product,sku,line.quantity);working.set(productId,changed.product);movements.push({movementId:`return_${returnId}_${index}`,productId,sku,deltaChange:line.quantity,stockAfter:changed.after,reason:'order_return'});}
  });
  const replacementItems:DocumentData[]=[];let replacementPaise=0;
  input.replacements.forEach((line,index)=>{const product=working.get(line.productId)!,variant=product.variants?.find((v:any)=>v.sku===line.sku),price=Number(variant?.price??variant?.salePrice??product.salePrice??product.price);
    if(!Number.isFinite(price)||price<=0)reject('Replacement price is invalid.',409);
    const changed=changeStock(product,line.sku,-line.quantity);working.set(line.productId,changed.product);replacementPaise+=Math.round(price*100)*line.quantity;
    replacementItems.push({...line,name:product.name||'',size:variant?.size||'',color:variant?.color||'',price});movements.push({movementId:`${returnId}_exchange_${index}`,productId:line.productId,sku:line.sku,deltaChange:-line.quantity,stockAfter:changed.after,reason:'exchange_sale'});
  });
  const difference=(replacementPaise-Math.round((amount-creditCancelled)*100))/100;
  if(input.replacements.length&&(input.expectedDifference===undefined||Math.round(input.expectedDifference*100)!==Math.round(difference*100)))reject('Replacement prices changed. Review the price difference and retry.',409);
  const number=Number(counter.data()?.lastNumber||0)+1,creditNoteId=`BOG-CN-${fy}-${String(number).padStart(5,'0')}`;
  if(state&&creditCancelled>0)appendCreditEntry(db,tx,state,`return_${hash(returnId)}`,{kind:'return',creditDelta:-creditCancelled,appliesTo:input.orderId,orderId:input.orderId,note:`Credit cancelled by ${creditNoteId}`});
  for(const ref of refs)tx.update(ref,{...working.get(ref.id),updatedAt:FieldValue.serverTimestamp()});
  for(const movement of movements)tx.create(db.collection('stockMovements').doc(movement.movementId),{...movement,source:'pos',orderId:input.orderId,returnId,createdAt:FieldValue.serverTimestamp()});
  const completed=items.every((item,index)=>returnedQuantities[index]===item.quantity);
  tx.update(orderRef,{status:completed?'Returned':'Partially returned',returnedQuantities,returnedAmount:(Math.round(Number(order.returnedAmount||0)*100)+Math.round(amount*100))/100,inventoryRestored:completed,updatedAt:FieldValue.serverTimestamp(),...(completed?{stockRestoredAt:FieldValue.serverTimestamp()}:{}),returnCreditNoteId:creditNoteId});
  tx.set(counterRef,{lastNumber:number},{merge:true});
  const refundAmountToReview=Math.max(0,-difference);
  tx.create(returnRef,{orderId:input.orderId,creditNoteId,reason:input.reason,lines:selected,total:amount,creditCancelled,refundAmountToReview,refundedAmount:0,refundStatus:refundAmountToReview?'review_required':'not_required',createdAt:FieldValue.serverTimestamp()});
  tx.create(db.collection('erp_creditNotes').doc(creditNoteId),{orderId:input.orderId,returnId,lines:selected,total:amount,reason:input.reason,creditCancelled,createdAt:FieldValue.serverTimestamp()});
  let exchangeInvoiceId='';
  if(replacementItems.length){const sequence=Number(invoiceSequence?.data()?.lastNumber||0)+1;exchangeInvoiceId=`BOG-${fy}-${String(sequence).padStart(5,'0')}`;const exchangeOrderId=`EX-${hash(input.requestId).slice(0,24)}`,exchangeCreditUsed=Math.min(replacementPaise/100,amount-creditCancelled),payments=difference>0?[{method:input.differenceMethod,amount:difference}]:[];
    tx.set(invoiceCounter,{lastNumber:sequence},{merge:true});
    const common={customerName:order.customerName||'',customerPhone:order.customerPhone||'',total:replacementPaise/100,subtotal:replacementPaise/100,discount:0,paymentMethod:input.differenceMethod,payments,exchangeCreditUsed,exchangeReturnId:returnId,createdAt:FieldValue.serverTimestamp()};
    tx.create(db.collection('orders').doc(exchangeOrderId),{...common,totalAmount:replacementPaise/100,items:replacementItems,status:'Delivered',paymentStatus:'Paid',createdBy:'admin-pos',inventoryDeducted:true});
    tx.create(db.collection('erp_invoices').doc(exchangeInvoiceId),{...common,orderId:exchangeOrderId,lines:replacementItems,channel:'POS',kind:'sales_receipt',invoiceNumber:sequence,fiscalYear:fy});
  }
  tx.create(db.collection('erp_auditLog').doc(hash(`return:${input.requestId}`)),{actor:res.locals.owner?.uid||'pin-owner',target:input.orderId,action:'return_or_exchange',returnId,creditNoteId,createdAt:FieldValue.serverTimestamp()});
  return {orderId:input.orderId,returnId,creditNoteId,refundAmountToReview,creditCancelled,exchangeInvoiceId,amountToCollect:Math.max(0,difference),refundStatus:refundAmountToReview?'review_required':'not_required'};
 }));}catch(e){fail(res,e);}
});
returnsRouter.get('/refunds/pending',async(_req,res)=>{try{const docs=await firebase().db.collection('erp_returns').where('refundStatus','==','review_required').get();res.json({items:docs.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){fail(res,e);}});
returnsRouter.post('/orders/refund',async(req,res)=>{
 const parsed=z.object({requestId:id.min(12),returnId:id,amount:money.refine(n=>n>0&&Math.abs(n*100-Math.round(n*100))<.00001),method:z.enum(['cash','upi','card']),reference:z.string().trim().min(1).max(200)}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter the paid refund amount, method and payment reference.'});return;}
 try{const db=firebase().db,input=parsed.data;res.json(await idempotent(db,'refund',input.requestId,input,async tx=>{
  const ref=db.collection('erp_returns').doc(input.returnId),doc=await tx.get(ref);if(!doc.exists)reject('Return not found.',404);const row=doc.data()!,balance=Math.round(Number(row.refundAmountToReview)*100)-Math.round(Number(row.refundedAmount||0)*100);
  if(Math.round(input.amount*100)>balance)reject('Refund exceeds the remaining refundable amount.');
  const refunded=(Math.round(Number(row.refundedAmount||0)*100)+Math.round(input.amount*100))/100;
  tx.update(ref,{refundedAmount:refunded,refundStatus:Math.round(input.amount*100)===balance?'paid':'review_required'});
  tx.create(db.collection('erp_refunds').doc(hash(input.requestId)),{...input,orderId:row.orderId,createdAt:FieldValue.serverTimestamp()});return {refundedAmount:refunded};
 }));}catch(e){fail(res,e);}
});
