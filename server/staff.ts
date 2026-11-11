import { Router } from 'express';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { firebase } from './firebase.js';
import { config } from './config.js';
import { idempotent } from './transactions.js';
import type { Owner } from '../shared/contracts.js';
export const staffRouter=Router();
export function pinMatches(pin:string,salt:string,digest:string){try{return timingSafeEqual(scryptSync(pin,salt,32),Buffer.from(digest,'hex'));}catch{return false;}}
export async function staffIdentity(pin:string):Promise<Owner|null>{
 try{const docs=await firebase().db.collection('erp_staff').where('active','==',true).limit(50).get();for(const doc of docs.docs){const s=doc.data();if(pinMatches(pin,s.salt,s.pinHash))return {uid:doc.id,email:null,role:s.role,name:s.name};}}catch{}return null;
}
export async function currentStaff(identity:Owner):Promise<Owner>{if(identity.role==='owner')return identity;const doc=await firebase().db.collection('erp_staff').doc(identity.uid).get();if(!doc.exists||doc.data()?.active!==true)throw new Error('Staff access revoked.');return {uid:doc.id,email:null,name:doc.data()?.name,role:doc.data()?.role};}
staffRouter.get('/staff',async(_req,res)=>{if(res.locals.owner?.role!=='owner'){res.status(403).json({error:'Owner access required.'});return;}try{const docs=await firebase().db.collection('erp_staff').get();res.json({items:docs.docs.map(d=>({id:d.id,name:d.data().name,role:d.data().role,active:d.data().active}))});}catch{res.status(503).json({error:'Staff settings unavailable.'});}});
staffRouter.post('/staff/save',async(req,res)=>{
 if(res.locals.owner?.role!=='owner'){res.status(403).json({error:'Owner access required.'});return;}
 const parsed=z.object({requestId:z.string().min(12).max(128).regex(/^[\w.:-]+$/),id:z.string().regex(/^[\w-]+$/).optional(),name:z.string().trim().min(2).max(80),role:z.enum(['cashier','manager']),pin:z.string().regex(/^\d{4}$/).optional(),active:z.boolean()}).strict().safeParse(req.body);
 if(!parsed.success){res.status(422).json({error:'Enter staff name, role and a four-digit PIN for a new account.'});return;}
 const input=parsed.data;if((!input.id&&!input.pin)||(input.pin&&input.pin===config.adminPin)){res.status(422).json({error:'Use a unique staff PIN, different from the owner PIN.'});return;}
 try{if(config.sessionSecret.length<32)throw new Error('Configure a session secret for staff access.');const db=firebase().db;const salt=randomBytes(16).toString('hex'),pinHash=input.pin?scryptSync(input.pin,salt,32).toString('hex'):'';
 // idempotent stores only a SHA-256 payload fingerprint, never this input.
 const safeInput={id:input.id||'',name:input.name,role:input.role,active:input.active,pinFingerprint:input.pin?createHmac('sha256',config.sessionSecret).update(input.requestId+':'+input.pin).digest('hex'):null};
 const result=await idempotent(db,'staff_save',input.requestId,safeInput,async tx=>{const all=await tx.get(db.collection('erp_staff'));if(!input.id&&all.size>=50)throw Object.assign(new Error('Maximum 50 staff accounts.'),{status:422});
 if(input.pin&&all.docs.some(d=>d.id!==input.id&&d.data().active&&pinMatches(input.pin!,d.data().salt,d.data().pinHash)))throw Object.assign(new Error('This PIN is already assigned.'),{status:409});
 const ref=db.collection('erp_staff').doc(input.id||`staff-${input.requestId}`),old=await tx.get(ref);if(input.id&&!old.exists)throw Object.assign(new Error('Staff member not found.'),{status:404});
 tx.set(ref,{name:input.name,role:input.role,active:input.active,...(input.pin?{salt,pinHash}:{}),updatedAt:FieldValue.serverTimestamp()},{merge:true});return {id:ref.id};});res.json(result);
 }catch(e){res.status((e as any).status||503).json({error:(e as any).status?(e as Error).message:'Staff change unconfirmed. Retry using the same reference.'});}
});
