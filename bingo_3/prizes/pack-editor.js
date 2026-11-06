import {MAX_PACK_ITEMS,validatePack,encodePack} from './pack-core.js?v=20261104-debug3';
export function createPackEditor({fetchGift,addProductImage,removeProductImage,onChange}){
  const $=id=>document.getElementById(id),items=[];let serial=0;
  const enabled=()=>$('prize-kind').value==='pack';
  function refresh(){
    $('reference-price').readOnly=enabled();if(enabled())total();
    $('single-gift-import').hidden=enabled();$('pack-panel').hidden=!enabled();
    $('pack-add').disabled=items.length>=MAX_PACK_ITEMS;
    $('pack-count').textContent=`${items.length} / ${MAX_PACK_ITEMS}件`;
    onChange();
  }
  function total(){if(!enabled())return;$('reference-price').value=items.length&&items.every(i=>/^\d{1,9}$/.test(i.price||''))?String(items.reduce((n,i)=>n+Number(i.price),0)):'';}
  function add(initial){
    if(items.length>=MAX_PACK_ITEMS)return;
    const restoredId=Number(initial?.id),id=Number.isSafeInteger(restoredId)&&restoredId>0&&restoredId<1000000&&!items.some(i=>i.id===restoredId)?restoredId:serial+1;serial=Math.max(serial,id);
    const item={id,giftUrl:initial?.giftUrl||'',product:initial?.product||null,price:initial?.price||''};items.push(item);
    const card=document.createElement('div');card.className='pack-item url-import';
    const heading=document.createElement('h3');heading.textContent='ギフト '+item.id;
    const label=document.createElement('label');label.textContent='BOOTHのギフトURL';
    const input=document.createElement('input');input.type='url';input.autocomplete='off';input.placeholder='https://booth.pm/gifts/…';input.value=item.giftUrl;input.id=`pack-gift-${item.id}`;label.htmlFor=input.id;
    const actions=document.createElement('div');actions.className='pack-item-heading';
    const fetch=document.createElement('button');fetch.type='button';fetch.className='prize-button primary';fetch.textContent='商品情報を取得';
    const remove=document.createElement('button');remove.type='button';remove.className='prize-button';remove.textContent='削除';
    const result=document.createElement('p');result.className='prize-status';result.setAttribute('role','status');
    const priceLabel=document.createElement('label');priceLabel.textContent='参考価格（円）';const price=document.createElement('input');price.type='number';price.min='0';price.max='999999999';price.step='1';price.value=item.price;priceLabel.append(price);if(item.product)result.textContent=`${item.product.name} ／ ${item.product.shop}`;
    input.addEventListener('input',()=>{item.giftUrl=input.value.trim();item.product=null;item.price='';price.value='';removeProductImage?.(`pack:${item.id}`);result.textContent='';refresh();});
    price.addEventListener('input',()=>{item.price=price.value;total();onChange();});
    fetch.onclick=async()=>{
      const requested=input.value.trim();fetch.disabled=true;result.textContent='商品情報を取得しています…';
      try{const product=await fetchGift(requested);if(!items.includes(item)||input.value.trim()!==requested)return;item.product=product;item.price=product.price;price.value=item.price;result.textContent=`${product.name} ／ ${product.shop}`;
        total();onChange();
        try{await addProductImage(product,items.indexOf(item),items.length,item.id,()=>items.includes(item)&&item.product===product&&input.value.trim()===requested);}catch{result.textContent+='（画像は取得できませんでした。画像を追加してください。）';}
      }catch(error){result.textContent=error.message;}finally{fetch.disabled=false;}
    };
    remove.onclick=()=>{removeProductImage?.(`pack:${item.id}`);items.splice(items.indexOf(item),1);card.remove();total();refresh();};
    const inputAction=document.createElement('div');inputAction.className='input-action';inputAction.append(input,fetch);actions.append(heading,remove);card.append(actions,label,inputAction,result,priceLabel);$('pack-items').append(card);refresh();
  }
  $('prize-kind').addEventListener('change',()=>{if(enabled()&&!items.length){add();add();}refresh();});
  $('pack-add').onclick=()=>add();
  $('pack-arrange').onclick=async()=>{const button=$('pack-arrange');button.disabled=true;try{if(items.some(i=>!i.product))throw Error('すべての商品情報を取得してください。');for(let index=0;index<items.length;index++){const item=items[index];await addProductImage(item.product,index,items.length,item.id,()=>items[index]===item);}$('pack-copy-status').textContent='商品画像を並べました。位置や大きさはレイヤーで調整できます。';}catch(error){$('pack-copy-status').textContent=error.message;}finally{button.disabled=false;}};
  $('pack-copy-gifts').onclick=async()=>{try{await navigator.clipboard.writeText(items.map(i=>i.giftUrl).join('\n'));$('pack-copy-status').textContent='ギフトURLをコピーしました。Googleフォームの「ギフトURL」へ貼り付けてください。';}catch{$('pack-copy-status').textContent='コピーできませんでした。各ギフトURLをフォームへ貼り付けてください。';}};
  refresh();
  return {enabled,exportState:()=>enabled()?items.map(i=>({id:i.id,price:i.price,product:i.product})):[],restore(saved,gifts){serial=0;items.splice(0);$('pack-items').replaceChildren();saved.forEach((item,index)=>add({...item,giftUrl:gifts[index]||''}));refresh();},errors:()=>enabled()?validatePack(items):[],encode:(saved=items)=>enabled()?encodePack(saved):Promise.resolve('')};
}
