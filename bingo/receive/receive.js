import {normalizeReceiptCode,validateReceipt} from './receipt-core.js?v=20261104-debug1';
const $=id=>document.getElementById(id);let config={},busy=false;
function status(text,error=false){$('receipt-status').textContent=text;$('receipt-status').classList.toggle('receipt-error',error);}

function link(text,url){const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';return a;}
function show(result){
  $('receipt-title').textContent=result.title;$('receipt-count').textContent=result.items.length>1?`${result.items.length}件の商品が含まれています。`:'BOOTHからギフトを受け取れます。';
  const root=$('receipt-products');root.replaceChildren();
  result.items.forEach((item,i)=>{const card=document.createElement('article');card.className='receipt-product';const title=document.createElement('h3');title.textContent=`${i+1}. ${item.name}`;card.append(title);
    if(item.shop){const shop=document.createElement('p');shop.textContent=item.shop;card.append(shop);}
    const actions=document.createElement('div');actions.className='receipt-product-actions';const receive=link('BOOTHでギフトを受け取る ↗',item.giftUrl);receive.className='button';actions.append(receive);
    if(item.productUrl)actions.append(link('商品ページ ↗',item.productUrl));card.append(actions);root.append(card);
  });$('receipt-result').hidden=false;$('receipt-title').tabIndex=-1;$('receipt-title').focus();
}
$('receipt-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;$('receipt-result').hidden=true;$('receipt-products').replaceChildren();const code=normalizeReceiptCode($('receipt-code').value);
  if(!/^[a-f0-9]{32}$/.test(code)){status('受取コードをすべてコピーして貼り付けてください。',true);return;}
  if(!config.endpoint){status('受け取りページは準備中です。W@へお問い合わせください。',true);return;}
  busy=true;$('receipt-submit').disabled=true;status('景品を確認しています…');
  try{
    const url=new URL(config.endpoint);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname))throw Error('接続先の設定をご確認ください。');
    const response=await fetch(url.href,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({code}),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('接続できませんでした。時間をおいて再度お試しください。');
    const raw=await response.json();if(raw.code==='LIMIT'||raw.code==='BUSY')throw Error('現在混み合っています。時間をおいて再度お試しください。');
    show(validateReceipt(raw));status('景品を表示しました。');
  }catch(error){status(error.name==='TimeoutError'?'確認に時間がかかっています。再度お試しください。':error.message,true);}finally{busy=false;$('receipt-submit').disabled=false;}
});
$('receipt-reset').onclick=()=>{$('receipt-result').hidden=true;$('receipt-products').replaceChildren();$('receipt-code').value='';status('');$('receipt-code').focus();};
fetch('./receive-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(c=>{config=c;if(!config.endpoint)status('受け取りページは準備中です。');}).catch(()=>status('設定を読み込めませんでした。再読み込みしてください。',true));
