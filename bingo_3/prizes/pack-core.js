import {normalizeBoothUrl,validateGiftUrls} from './prize-core.js';
export const MAX_PACK_ITEMS=10;
export function validatePack(items){
  const errors=[],seen=new Set();
  if(items.length<2||items.length>MAX_PACK_ITEMS)errors.push('パックには2〜10件のギフトを登録してください。');
  items.forEach((item,i)=>{
    const gift=String(item.giftUrl||'').trim(),check=validateGiftUrls(gift);
    if(check.count!==1||check.errors.length)errors.push(`${i+1}件目のギフトURLをご確認ください。`);
    else if(seen.has(gift.replace(/\/$/,'')))errors.push(`${i+1}件目のギフトURLが重複しています。`);
    seen.add(gift.replace(/\/$/,''));
    if(!/^\d{1,9}$/.test(String(item.price??'')))errors.push(`${i+1}件目の参考価格を0以上の整数でご入力ください。`);
    if(!item.product)errors.push(`${i+1}件目の商品情報を取得してください。`);
  });return errors;
}
export function publicPackItems(items){return items.map(item=>({name:Array.from(String(item.product.name)).slice(0,80).join(''),url:normalizeBoothUrl(item.product.url),shop:Array.from(String(item.product.shop||'')).slice(0,60).join(''),price:String(item.price??item.product.price??'')}));}
export async function encodePack(items){
  if(!globalThis.CompressionStream)throw Error('このブラウザーはパック投稿に対応していません。最新のブラウザーをご利用ください。');
  const bytes=new TextEncoder().encode(JSON.stringify({v:1,items:publicPackItems(items)}));
  const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const result='bingo-pack:v1:'+btoa(String.fromCharCode(...new Uint8Array(compressed)));
  if(result.length>6000)throw Error('パックの商品情報が長すぎます。商品名を短くしてください。');return result;
}
