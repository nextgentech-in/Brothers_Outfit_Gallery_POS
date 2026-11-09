export type DraftLanguage='en'|'hi'|'gu';
export function localizedDraft(language:DraftLanguage,kind:string,name:string,shop:string,amount:string,date:string,details:string){
 const text=language==='hi'?{
 hello:`नमस्ते ${name},`,offer:`${shop} की खास पेशकश:`,valid:`ऑफर ${date} तक मान्य है।`,visit:'अधिक जानकारी के लिए दुकान पर आएँ या जवाब दें।',birthday:`जन्मदिन मुबारक हो, ${name}! 🎉`,wish:`${shop} की ओर से आपको ढेर सारी शुभकामनाएँ।`,payment:`${shop} की ओर से भुगतान का रिमाइंडर।`,amount:`बकाया राशि: ₹${amount}`,due:`भुगतान की तारीख: ${date}`,paid:'अगर आपने भुगतान कर दिया है तो हमें बताएँ। धन्यवाद।',thanks:`${shop} से खरीदारी करने के लिए धन्यवाद!`,again:'हम फिर से आपका स्वागत करना चाहेंगे।'
 }:{hello:`નમસ્તે ${name},`,offer:`${shop} ની ખાસ ઓફર:`,valid:`ઓફર ${date} સુધી માન્ય છે.`,visit:'વધુ માહિતી માટે દુકાન પર આવો અથવા જવાબ આપો.',birthday:`જન્મદિવસની શુભેચ્છાઓ, ${name}! 🎉`,wish:`${shop} તરફથી તમને ખૂબ ખૂબ શુભેચ્છાઓ.`,payment:`${shop} તરફથી ચુકવણી માટે યાદ અપાવીએ છીએ.`,amount:`બાકી રકમ: ₹${amount}`,due:`ચુકવણીની તારીખ: ${date}`,paid:'જો તમે ચુકવણી કરી દીધી હોય તો અમને જણાવો. આભાર.',thanks:`${shop} માંથી ખરીદી કરવા બદલ આભાર!`,again:'અમે ફરીથી તમારું સ્વાગત કરવા ઈચ્છીએ છીએ.'};
 const lines=kind==='offer'?[text.hello,text.offer,details,date?text.valid:'',text.visit]:kind==='birthday'?[text.birthday,text.wish,details]:kind==='payment'?[text.hello,text.payment,amount?text.amount:'',date?text.due:'',details,text.paid]:kind==='thanks'?[text.hello,text.thanks,details,text.again]:[];
 return lines.filter(Boolean).join('\n\n');
}
