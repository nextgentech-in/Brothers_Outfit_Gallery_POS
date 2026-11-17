export type ReturnSelection = { index: number; quantity: number; restock: boolean };
export function returnAmounts(items: {quantity:number;price:number;amount?:number}[], total:number, previous:Record<string,number>, selected:ReturnSelection[]) {
 const gross=items.reduce((n,i)=>n+Math.round(i.price*100)*i.quantity,0),net=Math.round(total*100);
 let cumulative=0,allocated=0;
 const billed = items.map(item => Number.isFinite(item.amount) ? Math.round(item.amount! * 100) : -1);
 const useBilledAmounts = billed.every(amount => amount >= 0) && billed.reduce((sum, amount) => sum + amount, 0) === net;
 const lineNets=useBilledAmounts ? billed : items.map(i=>{cumulative+=Math.round(i.price*100)*i.quantity;const next=gross?Math.round(cumulative*net/gross):0;const amount=next-allocated;allocated=next;return amount;});
 const seen=new Set<number>();let amount=0;
 for(const selection of selected){const item=items[selection.index],old=previous[selection.index]||0;
  if(!item||seen.has(selection.index)||!Number.isInteger(selection.quantity)||selection.quantity<1||old+selection.quantity>item.quantity)throw new Error('Return quantity exceeds the remaining items.');
  seen.add(selection.index);amount+=Math.round(lineNets[selection.index]*(old+selection.quantity)/item.quantity)-Math.round(lineNets[selection.index]*old/item.quantity);
 }
 if(!selected.length)throw new Error('Choose at least one item to return.');return amount/100;
}
