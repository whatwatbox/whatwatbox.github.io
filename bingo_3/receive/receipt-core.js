export function normalizeReceiptCode(value){const compact=String(value).trim().replace(/[\s-]/g,'');return (/^b3[a-f0-9]{32}$/i.test(compact)?compact.slice(2):compact).toLowerCase();}
export function validateReceipt(data){
  if(!data?.ok||typeof data.title!=='string'||!Array.isArray(data.items)||!data.items.length||data.items.length>10)throw Error('コードが見つからないか、現在は受け付けていません。コードをご確認ください。');
  return {title:data.title.slice(0,160),items:data.items.map(item=>{
    if(!/^https:\/\/booth\.pm\/gifts\/[a-zA-Z0-9_-]+\/?$/.test(item.giftUrl||''))throw Error('景品情報を表示できません。W@へお問い合わせください。');
    if(item.productUrl&&!/^https:\/\/(?:[a-z0-9-]+\.)?booth\.pm\/(?:[a-z]{2}\/)?items\/\d{1,12}$/.test(item.productUrl))throw Error('商品情報を表示できません。');
    return {name:String(item.name||'商品').slice(0,160),shop:String(item.shop||'').slice(0,120),giftUrl:item.giftUrl,productUrl:item.productUrl||''};
  })};
}
