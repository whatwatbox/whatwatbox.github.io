import {filterPrizes,safeThumbnailUrl} from './catalog-core.js';
let items=[],category='',platform='',loading=false,connected=false,configPromise;
const CACHE_KEY='bingo-public-catalog-v2',CACHE_TTL=5*60*1000;
function validData(data){return data?.ok===true&&data.v===1&&Array.isArray(data.items)&&data.items.length<=1000;}
function saveCache(endpoint,data){try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({endpoint,savedAt:Date.now(),data}));}catch{}}
function restoreCache(endpoint){try{const c=JSON.parse(sessionStorage.getItem(CACHE_KEY));if(c.endpoint===endpoint&&Date.now()-c.savedAt<CACHE_TTL&&validData(c.data)){connected=true;items=c.data.items.filter(p=>p&&typeof p.name==='string'&&['single','pack'].includes(p.kind));render();$('catalog-update').textContent='前回の一覧を表示しています。最新情報を確認中…';}}catch{}}
const $=id=>document.getElementById(id),status=$('catalog-status'),grid=$('catalog-grid');
function text(tag,value,className=''){const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;}
function chips(id,values,set){const box=$(id);['すべて',...values].forEach((v,i)=>{const b=text('button',v);b.type='button';b.setAttribute('aria-pressed',String(i===0));b.addEventListener('click',()=>{box.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));set(i?v:'');render();});box.append(b);});}
chips('category-filters',['アバター','衣装','アクセサリー','ギミック','楽曲','その他'],v=>category=v);
chips('platform-filters',['VRM','Unity','VRoid','Xwear','VRC','cluster','ギフト','その他'],v=>platform=v);
const viewer=document.createElement('dialog');
viewer.className='catalog-viewer';
viewer.setAttribute('aria-label','景品画像の拡大表示');
const closeViewer=text('button','閉じる ×','catalog-viewer-close');
closeViewer.type='button';
const enlarged=document.createElement('img');
const viewerStage=text('div','','catalog-viewer-stage');
const previousImage=text('button','‹','catalog-viewer-nav catalog-viewer-previous');
const nextImage=text('button','›','catalog-viewer-nav catalog-viewer-next');
previousImage.type=nextImage.type='button';
previousImage.setAttribute('aria-label','前の景品');nextImage.setAttribute('aria-label','次の景品');
const viewerPosition=text('p','','catalog-viewer-position');viewerPosition.setAttribute('aria-live','polite');
let viewerItems=[],viewerIndex=0,shownItems=[];
function showImage(index){
  if(index<0||index>=viewerItems.length)return;
  viewerIndex=index;const prize=viewerItems[index];
  enlarged.src=safeThumbnailUrl(prize.thumbnailUrl);enlarged.alt=prize.name;
  previousImage.disabled=index===0;nextImage.disabled=index===viewerItems.length-1;
  viewerPosition.textContent=(index+1)+' / '+viewerItems.length;
}
previousImage.addEventListener('click',()=>showImage(viewerIndex-1));
nextImage.addEventListener('click',()=>showImage(viewerIndex+1));
viewer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();showImage(viewerIndex+(e.key==='ArrowLeft'?-1:1));}});
viewerStage.append(enlarged,previousImage,nextImage);
viewer.append(closeViewer,viewerStage,viewerPosition);document.body.append(viewer);
closeViewer.addEventListener('click',()=>viewer.close());
viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close();});
viewer.addEventListener('close',()=>{enlarged.removeAttribute('src');viewerItems=[];});
function card(p){
  const c=document.createElement('article');c.className='catalog-card';
  const imageUrl=safeThumbnailUrl(p.thumbnailUrl);
  if(imageUrl){
    const button=document.createElement('button');button.type='button';button.className='catalog-image-button';button.setAttribute('aria-label',p.name+'の画像を拡大');
    const img=document.createElement('img');img.src=imageUrl;img.alt=p.name;img.className='catalog-thumb';img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{button.disabled=true;img.hidden=true;button.append(text('span','画像を反映中です','catalog-image-pending'));},{once:true});img.width=512;img.height=512;
    button.append(img);button.addEventListener('click',()=>{viewerItems=shownItems.filter(prize=>safeThumbnailUrl(prize.thumbnailUrl));showImage(viewerItems.indexOf(p));viewer.showModal();});c.append(button);
  }else{const ph=text('div','','catalog-placeholder');ph.setAttribute('aria-label',p.name+'：サムネイル準備中');ph.append(text('span','B'),text('p','サムネイル準備中'));c.append(ph);}
  return c;
}
function render(){if(!connected)return;const shown=filterPrizes(items,{query:$('catalog-query').value,category,platform,kind:$('catalog-kind').value});shownItems=shown;grid.replaceChildren(...shown.map(card));$('catalog-count').textContent=shown.length+' / '+items.length+'件';status.hidden=shown.length>0;if(!shown.length)status.textContent=items.length?'条件に合う景品がありません。絞り込みを変更してみてください。':'公開対象の景品はまだありません。投稿が反映されるまでお待ちください。';}
$('catalog-query').addEventListener('input',render);$('catalog-kind').addEventListener('change',render);$('clear-filters').addEventListener('click',()=>{category=platform='';$('catalog-query').value='';$('catalog-kind').value='';document.querySelectorAll('.filter-chips').forEach(box=>box.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0))));render();});
async function load(){if(loading)return;loading=true;$('reload-catalog').disabled=true;try{const config=await (configPromise??=fetch('./catalog-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{configPromise=undefined;throw e;}));if(config.enabled!==true){status.hidden=false;status.textContent='景品一覧は公開準備中です。接続が完了すると投稿内容を表示します。';$('catalog-update').textContent='自動更新の接続準備中';$('catalog-count').textContent='';return;}const url=new URL(config.endpoint);if(url.protocol!=='https:'||url.hostname!=='script.google.com')throw Error();if(!connected)restoreCache(config.endpoint);if(!connected){try{const snapshot=await fetch('https://watbox.net/bingo/catalog/public-catalog.json',{cache:'no-cache',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error();return r.json();});if(validData(snapshot)){items=snapshot.items;connected=true;render();$('catalog-update').textContent='最新情報を確認中…';}}catch{}}url.searchParams.set('action','publicCatalogInfo');const r=await fetch(url,{signal:AbortSignal.timeout(45000),cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!validData(data))throw Error();const previous=JSON.stringify(items);const wasConnected=connected;connected=true;items=data.items.filter(p=>p&&typeof p.name==='string'&&['single','pack'].includes(p.kind));saveCache(config.endpoint,data);const date=new Date(data.updatedAt);$('catalog-update').textContent='アクセス時に更新確認（最大約1分のキャッシュ）'+(Number.isFinite(date.getTime())?' ／ 最終更新：'+new Intl.DateTimeFormat('ja-JP',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tokyo'}).format(date)+'（日本時間）':'');if(!wasConnected||previous!==JSON.stringify(items)||grid.querySelector('.catalog-image-pending'))render();}catch{if(!items.length){status.hidden=false;status.textContent='景品一覧を読み込めませんでした。「更新する」からもう一度お試しください。';$('catalog-count').textContent='';}$('catalog-update').textContent='更新に失敗しました。しばらくしてからお試しください。';}finally{loading=false;$('reload-catalog').disabled=false;}}
$('reload-catalog').addEventListener('click',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});setInterval(()=>{if(!document.hidden)load();},60*1000);load();
