import { purchaseLineSchema, type PurchaseLine } from './purchases.js';
export function purchaseCsv(text:string):PurchaseLine[]{
 if(text.length>200000)throw new Error('CSV is too large. Use up to 30 rows.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell.trim());cell='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')cell+=c;}
 if(quoted)throw new Error('CSV contains an unclosed quote.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 const headers=rows.shift()?.map(s=>s.replace(/^\uFEFF/,'').trim())||[];
 if(!['sku','quantity','unitCost','salePrice','mrp'].every(h=>headers.includes(h))||new Set(headers).size!==headers.length)throw new Error('Use the supplied CSV column headings.');
 const data=rows.filter(r=>r.some(Boolean));if(!data.length||data.length>30)throw new Error('Import between 1 and 30 items.');
 return data.map((r,index)=>{if(r.length!==headers.length)throw new Error(`CSV row ${index+2}: column count differs from headings.`);const v=Object.fromEntries(headers.map((h,i)=>[h,r[i]]));const parsed=purchaseLineSchema.safeParse({sku:v.sku,quantity:Number(v.quantity),unitCost:v.unitCost===''?NaN:Number(v.unitCost),salePrice:Number(v.salePrice),mrp:Number(v.mrp),...(v.productId?{productId:v.productId}:{newItem:{name:v.name,category:v.category,brand:v.brand||'',design:v.design||'',fabric:v.fabric||'',size:v.size,color:v.color}})});if(!parsed.success)throw new Error(`CSV row ${index+2}: ${parsed.error.issues[0].message}`);return parsed.data;});
}
