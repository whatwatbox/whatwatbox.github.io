import {createSubmissionLifecycle,forgetSubmission} from './submission-client.js?v=20261104-debug3';
import {createPackEditor} from './pack-editor.js?v=20261104-debug3';
import {createThumbnailUploader} from './image-upload.js?v=20261104-debug3';
import {renderPrizeCard,getCardTheme,layoutAward} from './card-render.js?v=20261104-debug3';
import {createLayers} from './layers.js?v=20261104-debug3';
import {normalizeBoothUrl,parseProduct,buildPrefillUrl,createSummary,validateGiftUrls,validateFields,CARD_TEXT_LIMITS} from './prize-core.js?v=20261104-debug3';

const $ = id => document.getElementById(id);
const fields = {productUrl:'booth-url',productName:'product-name',shopName:'shop-name',providerName:'provider-name',contact:'provider-contact',awardName:'award-name',price:'reference-price',clusterId:'cluster-id',category:'product-category',platform:'product-platform'};
let config = {}, product = null, sourceVersion = 0, requestVersion = 0;
const remoteImages=new Map();
let imageSaved = false, callbackSequence = 0;
const canvas = $('thumbnail-canvas'), ctx = canvas.getContext('2d');
const layerEditor=createLayers(canvas,draw);
let packEditor,lifecycle,restoredDescription='';
let syncTimer, latestImageData='',uploadThumbnail,syncVersion=0;
const values = () => ({...Object.fromEntries(Object.entries(fields).map(([name,id])=>[name,$(id).value.trim()])),guestRequest:$('guest-request').checked?'希望します':'',description:restoredDescription});
function status(id,text,error=false) { const element=$(id); element.textContent=text; element.classList.toggle('is-error',error); }
function editorSnapshot(){return {v:1,values:values(),kind:packEditor.enabled()?'pack':'single',items:packEditor.exportState(),layers:layerEditor.exportState()};}
function update() {
  const v=values();
  applyCardTheme();
  for (const [id,key] of [['review-name','productName'],['review-shop','shopName'],['review-provider','providerName']]) $(id).textContent=v[key] || '未入力';
  for (const [key,limit] of Object.entries(CARD_TEXT_LIMITS)) {
    const output=$(`${fields[key]}-count`), length=Array.from($(fields[key]).value.trim()).length;
    if(output){output.textContent=`${length} / ${limit}文字`;output.classList.toggle('is-error',length>limit);}
  }
  for(const [id,key,fallback]of [['card-award','awardName','賞の名前'],['card-category','category','カテゴリ'],['card-platform','platform','対応形式'],['card-product','productName','景品名'],['card-shop','shopName','ショップ名'],['card-provider','providerName','提供者名']]){
    $(id).textContent=v[key]||fallback;$(id).title=v[key]||fallback;
  }
  fitCardText();
  if(!$('validation-result').hidden)validation();
  queueSync();
}
function applyCardTheme(){
  const theme=getCardTheme($('product-category').value,$('product-platform').value),card=document.querySelector('.prize-card');
  for(const [key,value]of Object.entries(theme))card.style.setProperty(`--card-${key}`,value);
}
function fitCardText(){
  const award=$('card-award'),scale=document.querySelector('.prize-card').clientWidth/512;
  ctx.save();const layout=layoutAward(ctx,$('award-name').value.trim());ctx.restore();
  award.textContent=layout.lines.join('\n');award.style.fontSize=`${layout.size*scale}px`;award.style.lineHeight='1.12';

  for(const id of ['card-shop','card-provider']){
    const e=$(id);e.style.fontSize='';const style=getComputedStyle(e);let size=parseFloat(style.fontSize);
    const max=e.parentElement.clientWidth-30;
    ctx.save();ctx.font=`${style.fontWeight} ${size}px ${style.fontFamily}`;
    while(ctx.measureText(e.textContent).width>max&&size>10){size-=.5;ctx.font=`${style.fontWeight} ${size}px ${style.fontFamily}`;}
    ctx.restore();e.style.fontSize=`${size}px`;
  }
}
new ResizeObserver(fitCardText).observe(document.querySelector('.prize-card'));
document.fonts.ready.then(fitCardText);
Object.values(fields).forEach(id=>$(id).addEventListener('input',update));
$('guest-request').addEventListener('change',update);
function serviceUrl(action,args) {
  if(!config.metadataEndpoint) throw new Error('自動取得は準備中です。商品情報を直接ご入力ください。');
  const url=new URL(config.metadataEndpoint,location.href);
  const isScript=url.protocol==='https:' && url.hostname==='script.google.com' && /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname);
  const isDev=['127.0.0.1','localhost'].includes(location.hostname) && url.origin===location.origin;
  if(!isScript&&!isDev) throw new Error('商品情報取得サービスの設定をご確認ください。');
  url.searchParams.set('action',action);
  for(const [key,value]of Object.entries(args))url.searchParams.set(key,value);
  return url;
}
function jsonp(action,args) {
  return new Promise((resolve,reject)=>{
    let url;
    try{url=serviceUrl(action,args);}catch(error){reject(error);return;}
    const name=`bingoProduct_${Date.now()}_${callbackSequence++}`;
    url.searchParams.set('callback',name);
    const script=document.createElement('script');
    let timer;
    const cleanup=()=>{clearTimeout(timer);script.remove();delete window[name];};
    window[name]=result=>{cleanup();result?.ok?resolve(result):reject(new Error(result?.error||'商品情報を取得できませんでした。'));};
    script.onerror=()=>{cleanup();reject(new Error('商品情報を取得できませんでした。手動入力をご利用ください。'));};
    timer=setTimeout(()=>{cleanup();reject(new Error('取得がタイムアウトしました。時間をおいて再度お試しください。'));},20000);
    script.src=url.href;script.referrerPolicy='no-referrer';document.head.append(script);
  });
}
async function importProduct(data,url) {
  const nextProduct=parseProduct(data,url);
  if(product?.url!==nextProduct.url)layerEditor.clearProductImages();
  product=nextProduct;
  ++sourceVersion;
  draw();imageSaved=false;
  $('booth-url').value=product.url;
  $('product-name').value=product.name;
  $('shop-name').value=product.shop;
  // Keep user-written fields; lengthy scraped names remain visible for shortening.
  if(!$('reference-price').value)$('reference-price').value=product.price;
  const images=$('product-images');images.replaceChildren();
  product.images.forEach((url,index)=>{
    const button=document.createElement('button');button.type='button';button.className='product-image';button.setAttribute('aria-label',`商品画像 ${index+1} を選択`);button.setAttribute('aria-pressed','false');
    const img=document.createElement('img');img.src=url;img.alt=`商品画像 ${index+1}`;img.loading='lazy';img.referrerPolicy='no-referrer';button.append(img);
    button.addEventListener('click',()=>loadRemoteImage(index));images.append(button);
  });
  update();
  if(product.images.length)await loadRemoteImage(0);
}
async function fetchGiftProduct(giftUrl){
  const check=validateGiftUrls(giftUrl);
  if(check.count!==1||check.errors.length)throw Error('BOOTHのギフトURLを1件ご入力ください。');
  if(!config.giftMetadataEndpoint)throw Error('商品情報取得は接続準備中です。');
  const endpoint=new URL(config.giftMetadataEndpoint);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname))throw Error('情報取得先の設定をご確認ください。');
  const response=await fetch(endpoint.href,{method:'POST',body:new URLSearchParams({action:'gift',giftUrl}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('取得できませんでした。ギフトURLをご確認ください。');
  const result=await response.json();if(!result.ok)throw Error('取得できませんでした。ギフトURLをご確認ください。');return parseProduct(result.product,result.product.url);
}
$('fetch-gift').addEventListener('click',async()=>{
  const version=++requestVersion,button=$('fetch-gift');button.disabled=true;
  try{status('gift-fetch-status','ギフトの商品情報を取得しています…');const next=await fetchGiftProduct($('booth-gift-url').value.trim());if(version!==requestVersion)return;await importProduct(next,next.url);status('gift-fetch-status','商品情報を読み込みました。内容をご確認ください。');}
  catch(error){if(version===requestVersion)status('gift-fetch-status',error.message,true);}finally{button.disabled=false;}
});
packEditor=createPackEditor({fetchGift:fetchGiftProduct,onChange:update,removeProductImage:key=>layerEditor.removeProductImage(key),addProductImage:async(current,index,count,id,isCurrent=()=>true)=>{
  const key=`pack:${id}`;if(!isCurrent())return;
  if(layerEditor.arrangeProductImage(key,index,count))return;
  if(!current.images.length)throw Error('画像を読み込み直してください。');
  const image=await getRemoteImage(current,0);if(!isCurrent())return;
  layerEditor.addImage(image,current.name,key);layerEditor.arrangeProductImage(key,index,count);
}});
function loadImage(url,anonymous=false) {
  return new Promise((resolve,reject)=>{
    const image=new Image();if(anonymous)image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
    image.onload=()=>{if(image.naturalWidth*image.naturalHeight>40000000)reject(new Error('画像が大きすぎます。4000万画素以下の画像をご利用ください。'));else resolve(image);};
    image.onerror=()=>reject(new Error('画像を読み込めませんでした。画像ファイルを選択してください。'));
    image.src=url;
  });
}
function setImage(image,name,key){layerEditor.addImage(image,name,key);}
function getRemoteImage(current,index){
  const key=current.images[index];
  if(remoteImages.has(key))return remoteImages.get(key);
  const promise=(async()=>{
    // BOOTH image CDN lacks canvas CORS permission. Avoid a failed direct load
    // on every click; fetch the editable image once through the approved service.
    const result=await jsonp('image',{url:current.url,index:String(index)});
    if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl||''))throw Error();
    return loadImage(result.dataUrl);
  })();
  remoteImages.set(key,promise);
  promise.catch(()=>{if(remoteImages.get(key)===promise)remoteImages.delete(key);});
  while(remoteImages.size>4){const oldest=remoteImages.keys().next().value;if(oldest===key)break;remoteImages.delete(oldest);}
  return promise;
}
async function loadRemoteImage(index) {
  const version=++sourceVersion,current=product;
  if(!current?.images[index])return;
  $('product-images').querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  $('image-loading').hidden=false;canvas.setAttribute('aria-busy','true');
  status('image-status','商品画像を読み込んでいます…');
  try{
    const image=await getRemoteImage(current,index);
    if(version!==sourceVersion)return;
    setImage(image,`商品画像 ${index+1}`,`${current.url}#${index}`);status('image-status','商品画像をレイヤーに追加しました。');
    // Warm just one neighbour, rather than downloading the whole gallery.
    if(current.images[index+1])getRemoteImage(current,index+1).catch(()=>{});
  }catch{if(version===sourceVersion){
    $('product-images').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));
    status('image-status','画像を読み込めませんでした。もう一度選択するか、お手元の画像をご利用ください。',true);
  }}finally{if(version===sourceVersion){$('image-loading').hidden=true;canvas.removeAttribute('aria-busy');}}
}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  layerEditor.draw();imageSaved=false;
  $('canvas-empty').hidden=layerEditor.hasContent();
  $('save-image').disabled=!layerEditor.hasContent();queueSync();
}
$('save-image').addEventListener('click',async()=>{
  if(!layerEditor.hasContent())return;
  try{await document.fonts.ready;renderPrizeCard(canvas,values()).toBlob(blob=>{if(!blob){status('image-status','画像を書き出せませんでした。',true);return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cluster-bingo-prize-512x512.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);imageSaved=true;status('image-status','PNG画像を保存しました。編集内容はフォームへの反映にも使用します。');},'image/png');}
  catch{status('image-status','この画像は書き出せません。画像ファイルを読み込み直してください。',true);}
});
function validation() {
  Object.values(fields).forEach(id=>$(id).removeAttribute('aria-invalid'));
  const v=values(),errors=validateFields(v);
  if(packEditor?.enabled())packEditor.errors().forEach(message=>errors.push({key:'pack',message}));
  if(!layerEditor.hasContent())errors.push({key:'image',message:'景品画像を選択してください。'});

  const list=$('validation-errors');list.replaceChildren();
  errors.forEach(error=>{const li=document.createElement('li');li.textContent=error.message;list.append(li);if(fields[error.key])$(fields[error.key]).setAttribute('aria-invalid','true');});
  $('validation-result').hidden=false;status('validation-status',errors.length?`${errors.length}件の項目をご確認ください。`:'入力内容を確認しました。Googleフォームへ進めます。',!!errors.length);
  return {v,errors};
}
$('validate-information').addEventListener('click',validation);
function encodeThumbnail(){
  if(!layerEditor.hasContent())return '';
  const out=renderPrizeCard(canvas,values());
  for(const quality of [.85,.7,.55,.4,.25]){const data=out.toDataURL('image/jpeg',quality);if(data.length<=40000)return data;}
  throw new Error('画像データが大きいため引き継げません。画像や文字を減らして再度お試しください。');
}
function queueSync(){if(lifecycle?.isLocked())return;clearTimeout(syncTimer);if($('auto-sync')?.checked)syncTimer=setTimeout(()=>syncForm(false),1200);}
async function syncForm(scroll=false){
  clearTimeout(syncTimer);
  if(!config.formUrl||lifecycle?.isLocked())return;
  const version=++syncVersion;
  try{
    await document.fonts.ready;if(version!==syncVersion)return;
    const snapshot=editorSnapshot(),v={...snapshot.values};
    latestImageData=encodeThumbnail();
    if(snapshot.kind==='pack'){const errors=packEditor.errors();if(errors.length)throw Error(errors[0]);v.packData=await packEditor.encode(snapshot.items);}
    const url=new URL(buildPrefillUrl(config,v));url.searchParams.set('embedded','true');
    if(url.href.length>7000)throw Error('入力内容が長すぎます。商品名などを短くしてください。');
    if(!latestImageData)throw new Error('景品画像を選択してください。');
    if(!config.entries.internalData||!config.entries.editId)throw new Error('内部情報のフォーム項目が未設定です。');
    status('image-data-status','画像をアップロードしています…');
    const imageId=await uploadThumbnail(latestImageData);
    if(version!==syncVersion)return;
    const prepared=await lifecycle.prepare(imageId,v.packData||'',{snapshot,isCurrent:()=>version===syncVersion});
    if(version!==syncVersion)return;
    url.searchParams.set(config.entries.internalData,prepared.internalData);url.searchParams.set(config.entries.editId,prepared.editId);
    // Only an opaque image reference enters the URL; never image bytes or gift URLs.
    if(url.href.length>7500)throw Error('入力内容が長すぎます。景品名などを短くしてください。');
    const frame=$('google-form-frame');if(frame.getAttribute('src')!==url.href)frame.src=url.href;
    $('form-external').href=url.href;
    status('image-data-status','画像と復元用データを保存しました。投稿はフォームでの送信後に完了します。');
    status('form-status','入力内容と画像IDを反映しました。下のフォームで確認し、ギフトURLを入力して送信してください。');
    if(scroll)frame.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){if(version!==syncVersion)return;status('image-data-status','画像の反映が完了していません。',true);status('form-status',error.message,true);}
}
$('open-google-form').addEventListener('click',()=>{const {errors}=validation();if(!errors.length)syncForm(true);});
$('auto-sync').addEventListener('change',()=>{if($('auto-sync').checked)syncForm(false);else{clearTimeout(syncTimer);++syncVersion;status('form-status','自動反映を停止しました。フォームの内容を確認して送信してください。');status('image-data-status','');}});
$('copy-information').addEventListener('click',async()=>{
  const text=createSummary(values());
  if(!text){status('form-status','コピーする商品情報をご入力ください。',true);return;}
  try{await navigator.clipboard.writeText(text);status('form-status','商品情報をコピーしました。ギフトURLはコピー内容に含めていません。');}
  catch{$('copy-fallback').hidden=false;$('copy-fallback').value=text;$('copy-fallback').focus();$('copy-fallback').select();status('form-status','下の欄を選択してコピーしてください。');}
});
lifecycle=createSubmissionLifecycle({endpoint:()=>config.imageUploadEndpoint,
  getSnapshot:async()=>editorSnapshot(),
  restoreSnapshot:async(snapshot,gifts)=>{
    $('auto-sync').checked=false;clearTimeout(syncTimer);++sourceVersion;product=null;$('product-images').replaceChildren();
    for(const [key,id]of Object.entries(fields))$(id).value=snapshot.values[key]||'';
    restoredDescription=snapshot.values.description||'';
    $('guest-request').checked=snapshot.values.guestRequest==='希望します';$('prize-kind').value=snapshot.kind;
    packEditor.restore(snapshot.kind==='pack'?snapshot.items:[],gifts);$('booth-gift-url').value=snapshot.kind==='single'?(gifts[0]||''):'';
    await layerEditor.restoreState(snapshot.layers);update();
  },onRestored:()=>{uploadThumbnail=createThumbnailUploader({endpoint:config.imageUploadEndpoint});},
  onLock:()=>{clearTimeout(syncTimer);++syncVersion;$('auto-sync').checked=false;document.body.classList.add('is-submitted');}
});
async function init(){
  try{
    const response=await fetch('./prize-config.json',{cache:'no-store'});if(!response.ok)throw new Error();config=await response.json();uploadThumbnail=createThumbnailUploader({endpoint:config.imageUploadEndpoint});
    $('period-text').textContent=config.periodText||'受付期間は、決まり次第ご案内します。';
    $('reception-status').textContent=config.accepting?'受付中':'受付準備中';
    if(config.formUrl){$('open-google-form').disabled=false;$('form-external').href=config.formUrl;$('google-form-frame').src=config.formUrl+'?embedded=true';status('form-status',config.accepting?'入力内容の確認後、Googleフォームへ進んでください。':'下のGoogleフォームに入力内容を反映し、確認後に送信してください。');}
  }catch{status('form-status','設定を読み込めませんでした。再読み込みしてください。',true);}
  update();
  const params=new URLSearchParams(location.search);if(params.has('new')||params.has('restore')){forgetSubmission();if(params.has('restore')){document.querySelector('.submission-restore').open=true;$('restore-edit-id').focus();}history.replaceState(null,'',location.pathname+location.hash);}else lifecycle.resume();
}
init();
