import { Router } from 'express';
import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { idempotent } from './transactions.js';
import { summarize, paise } from '../shared/reports.js';
import { shopDate, validBirthDate, mobileNumber } from '../shared/customers.js';
import { validDueDate } from '../shared/credit.js';
import { customerKey } from './customerIdentity.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const requestId = z.string().min(12).max(128).regex(/^[\w.:-]+$/);
const money = z.number().finite().min(0).max(10000000).refine(n => Math.abs(n*100-paise(n))<.00001);
const method = z.enum(['cash','upi','card']);
const reject = (message: string, status=422): never => { throw Object.assign(new Error(message), {status}); };
const fail = (res: any, e: any) => res.status(e.status || 503).json({error:e.status ? e.message : 'Records unavailable. No change was confirmed.'});
export const operationsRouter = Router();
function range(from: unknown, to: unknown) {
  if (!validDueDate(from) || !validDueDate(to) || from > to) reject('Choose valid start and end dates.');
  const start = new Date(`${from}T00:00:00+05:30`), end = new Date(new Date(`${to}T00:00:00+05:30`).getTime()+86400000);
  return {start,end};
}
async function report(db: Firestore, from: string, to: string, tx?: Transaction):Promise<{summary:ReturnType<typeof summarize>;orders:any[];expenses:any[]}> {
  if(!tx)return db.runTransaction(transaction=>report(db,from,to,transaction),{readOnly:true});
  const {start,end}=range(from,to);
  const data = await Promise.all(['orders','erp_creditNotes','erp_customerLedger','erp_refunds','erp_expenses','erp_supplierPayments'].map(async collection => {
    const query = db.collection(collection).where('createdAt','>=',start).where('createdAt','<',end);
    const result = tx ? await tx.get(query) : await query.get(); return result.docs.map(d => ({id:d.id,...d.data()}));
  }));
  return {summary:summarize(...data as [any[],any[],any[],any[],any[],any[]]), orders:data[0], expenses:data[4]};
}
operationsRouter.get('/reports/summary', async (req,res) => {
  try {const from=String(req.query.from || shopDate()),to=String(req.query.to || from);res.json(await report(firebase().db,from,to));} catch(e){fail(res,e);}
});
operationsRouter.get('/orders/search', async(req,res)=>{
  try {
    const db=firebase().db, term=String(req.query.q||'').trim().slice(0,200), from=String(req.query.from||'1900-01-01'),to=String(req.query.to||shopDate());
    const {start,end}=range(from,to);
    const rows=await db.collection('orders').where('createdAt','>=',start).where('createdAt','<',end).orderBy('createdAt','desc').get();
    const invoices=await db.collection('erp_invoices').where('createdAt','>=',start).where('createdAt','<',end).get();
    const invoiceByOrder=new Map(invoices.docs.map(d=>[d.data().orderId,{id:d.id,...d.data()}]));
    const found=rows.docs.map(d=>({id:d.id,...d.data(),invoice:invoiceByOrder.get(d.id)})).filter((o:any)=>!term || `${o.id} ${o.customerName||o.shippingAddress?.fullName||''} ${o.customerPhone||o.shippingAddress?.phone||o.userPhone||''} ${o.invoice?.id||''}`.toLowerCase().includes(term.toLowerCase()) || (Boolean(mobileNumber(term))&&mobileNumber(term)===mobileNumber(o.customerPhone||o.shippingAddress?.phone||o.userPhone||'')));
    const offset=Math.max(0,Math.min(1000000,Number(req.query.offset)||0));
    res.json({items:found.slice(offset,offset+50),total:found.length,nextOffset:offset+50<found.length?offset+50:null});
  }catch(e){fail(res,e);}
});
operationsRouter.post('/expenses/create',async(req,res)=>{
 const parsed=z.object({requestId,amount:money.refine(n=>n>0),method,category:z.enum(['expense','withdrawal']),note:z.string().trim().min(2).max(300)}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter amount, payment method and a note.'});return;}
 try {const input=parsed.data,db=firebase().db;res.status(201).json(await idempotent(db,'expense',input.requestId,input,async tx=>{const id=hash(input.requestId);tx.create(db.collection('erp_expenses').doc(id),{...input,createdAt:FieldValue.serverTimestamp()});return {id};}));}catch(e){fail(res,e);}
});
operationsRouter.post('/day/close',async(req,res)=>{
 const parsed=z.object({requestId,date:z.string().refine(validDueDate),openingCash:money,countedCash:money,note:z.string().max(300).default('')}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter the business date and cash counts.'});return;}
 try{const input=parsed.data,db=firebase().db;res.json(await idempotent(db,'day_close',input.requestId,input,async tx=>{
   const ref=db.collection('erp_dayClosings').doc(input.date),old=await tx.get(ref);
   if(old.exists)reject('This date already has a closing. View its saved count and any later activity.',409);
   const data=await report(db,input.date,input.date,tx);const expectedCash=(paise(input.openingCash)+paise(data.summary.cashMovement))/100;
   const result={...input,summary:data.summary,expectedCash,variance:(paise(input.countedCash)-paise(expectedCash))/100};
   tx.create(ref,{...result,createdAt:FieldValue.serverTimestamp()});return result;
 }));}catch(e){fail(res,e);}
});
operationsRouter.get('/day/closing',async(req,res)=>{try{const date=String(req.query.date||shopDate());if(!validDueDate(date))reject('Invalid date.');const doc=await firebase().db.collection('erp_dayClosings').doc(date).get();res.json({closing:doc.exists?doc.data():null});}catch(e){fail(res,e);}});
operationsRouter.post('/suppliers/payment',async(req,res)=>{
 const parsed=z.object({requestId,supplierId:z.string().regex(/^[\w.:-]+$/),amount:money.refine(n=>n>0),method,note:z.string().max(300).default('')}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter a supplier, payment amount and method.'});return;}
 try{const db=firebase().db,input=parsed.data;res.json(await idempotent(db,'supplier_payment',input.requestId,input,async tx=>{
   const lock=db.collection('erp_supplierAccounts').doc(input.supplierId),account=await tx.get(lock);
   const bills=await tx.get(db.collection('erp_purchases').where('supplierId','==',input.supplierId));
   const rows=bills.docs.sort((a,b)=>(a.data().createdAt?.toMillis?.()||0)-(b.data().createdAt?.toMillis?.()||0));
   let rest=paise(input.amount); if(rest>rows.reduce((n,d)=>n+paise(d.data().payable),0))reject('Payment exceeds supplier balance.');
   for(const doc of rows){const paid=Math.min(rest,paise(doc.data().payable));rest-=paid;if(paid)tx.update(doc.ref,{amountPaid:(paise(doc.data().amountPaid)+paid)/100,payable:(paise(doc.data().payable)-paid)/100});}
   tx.set(lock,{revision:Number(account.data()?.revision||0)+1});tx.create(db.collection('erp_supplierPayments').doc(hash(input.requestId)),{...input,createdAt:FieldValue.serverTimestamp()});return {recorded:true};
 }));}catch(e){fail(res,e);}
});
operationsRouter.get('/suppliers/balances',async(_req,res)=>{try{const db=firebase().db;const [suppliers,purchases]=await Promise.all([db.collection('erp_suppliers').get(),db.collection('erp_purchases').get()]);res.json({items:suppliers.docs.map(d=>({id:d.id,name:d.data().name,balance:purchases.docs.filter(p=>p.data().supplierId===d.id).reduce((sum,p)=>sum+paise(p.data().payable),0)/100}))});}catch(e){fail(res,e);}});
operationsRouter.post('/customers/update',async(req,res)=>{
 const parsed=z.object({requestId,phone:z.string().refine(v=>Boolean(mobileNumber(v))),name:z.string().trim().min(1).max(120),email:z.union([z.email(),z.literal('')]),dateOfBirth:z.string().refine(validBirthDate),birthdayOffersOptIn:z.boolean()}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter a customer name, valid email and birthday.'});return;}
 try{const db=firebase().db,input=parsed.data;res.json(await idempotent(db,'customer_update',input.requestId,input,async tx=>{const ref=db.collection('erp_customerProfiles').doc(customerKey(input.phone,''));await tx.get(ref);tx.set(ref,{name:input.name,phone:mobileNumber(input.phone),email:input.email,dateOfBirth:input.dateOfBirth,birthdayOffersOptIn:input.birthdayOffersOptIn,updatedAt:FieldValue.serverTimestamp()},{merge:true});return {updated:true};}));}catch(e){fail(res,e);}
});
operationsRouter.post('/inventory/count',async(req,res)=>{
 const parsed=z.object({requestId,productId:z.string().regex(/^[\w.:-]+$/),lines:z.array(z.object({sku:z.string().regex(/^[\w.:-]+$/),expected:z.number().int().min(0),counted:z.number().int().min(0).max(100000),threshold:z.number().int().min(0).max(10000)}).strict()).min(1).max(100),note:z.string().trim().max(300).optional()}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter physical counts, reorder levels and a reason.'});return;}
 try{const db=firebase().db,input=parsed.data;res.json(await idempotent(db,'stock_count',input.requestId,input,async tx=>{
  const ref=db.collection('products').doc(input.productId),doc=await tx.get(ref);if(!doc.exists)reject('Product not found.',404);
  let product=doc.data()!;if(new Set(input.lines.map(l=>l.sku)).size!==input.lines.length)reject('Count each variant once.');
  const movements:any[]=[];
  for(const line of input.lines){const variant=product.variants?.find((v:any)=>v.sku===line.sku),target=variant||(!product.variants?.length&&product.sku===line.sku?product:null);if(!target)reject('Variant not found.',404);
    const before=Number(target.stock??target.quantity??0);if(before!==line.expected)reject('Stock changed while counting. Refresh and recount before saving.',409);if(line.counted<Number(target.reserved||0))reject('Count cannot fall below stock reserved for orders.',409);
    if(variant)product={...product,variants:product.variants.map((v:any)=>v.sku===line.sku?{...v,stock:line.counted,quantity:line.counted,reorderThreshold:line.threshold}:v)};
    else product={...product,stock:line.counted,quantity:line.counted,reorderThreshold:line.threshold};
    movements.push({productId:input.productId,sku:line.sku,deltaChange:line.counted-before,stockAfter:line.counted,reason:'physical_count',note:input.note || 'Physical stock count',source:'admin',createdAt:FieldValue.serverTimestamp()});
  }
  if(product.variants?.length){product.stock=product.variants.reduce((sum:number,v:any)=>sum+Number(v.stock||0),0);product.quantity=product.stock;}product.inStock=product.stock>0;
  tx.update(ref,{...product,updatedAt:FieldValue.serverTimestamp()});movements.forEach((m,index)=>tx.create(db.collection('stockMovements').doc(`count_${hash(input.requestId)}_${index}`),m));return {updated:true};
 }));}catch(e){fail(res,e);}
});
