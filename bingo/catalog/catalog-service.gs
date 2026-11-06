/* Public catalog: only explicit public fields and claimed JPEG thumbnails.
 * The response spreadsheet and image folder remain PRIVATE.
 * Submission state 有効 is required. 一覧公開=非公開 excludes a row.
 * Receipt activation is deliberately independent from catalog visibility.
 */
var CATALOG_TTL_MS=60*1000;
function catalogSource_(book){var sheets=book.getSheets().filter(function(s){if(!s.getLastRow())return false;var h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];return h.indexOf('投稿状態')>=0&&h.indexOf('景品名')>=0&&h.indexOf('内部情報')>=0;});if(sheets.length!==1)throw Error('SETUP');return sheets[0];}
function catalogSafeText_(value,max){var s=String(value==null?'':value).trim();if(/booth\.pm\/gifts\/|B3[ES]-[a-f0-9-]+|bingo-image:|[^\s@]+@[^\s@]+\.[^\s@]+/i.test(s))throw Error('PRIVATE');return s.slice(0,max);}
function catalogBuild_(sheet,loadImage,now){
 var rows=sheet.getDataRange().getValues(),headers=rows.shift(),items=[];
 if(rows.length>1000)throw Error('LIMIT');
 var categories=['アバター','衣装','アクセサリー','ギミック','楽曲','その他'],platforms=['VRM','Unity','VRoid','Xwear','VRC','cluster','ギフト','その他'];
 rows.forEach(function(row,index){var read=function(n){var i=headers.indexOf(n);return i<0?'':row[i];};
  if(read('投稿状態')!=='有効'||String(read('一覧公開')).trim()==='非公開')return;
  try{
   var internal=JSON.parse(read('内部情報')||'{}'),title=catalogSafeText_(read('景品名'),160);if(!title)return;
   var pack=internal.packData?receiptPack_(internal.packData):null;
   var productUrl=read('商品URL(任意)')?receiptProduct_(String(read('商品URL(任意)')).trim()):'';
   var products=pack?pack.map(function(p){return {name:catalogSafeText_(p.name,160),shop:catalogSafeText_(p.shop,120),url:p.url};}):[];
   var key=sheet.getSheetId()+':'+(index+2),imageId=String(internal.imageId||read('サムネ画像ID')||''),thumb='';
   try{thumb=loadImage(imageId,key);}catch(_){} // Missing images do not hide otherwise valid prizes.
   if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(thumb)||thumb.length>40000)thumb='';
   items.push({id:'p-'+imageHash_(key).slice(0,20),name:title,award:catalogSafeText_(read('賞の名前'),60),shop:catalogSafeText_(read('景品元名'),120),provider:catalogSafeText_(read('応募者名'),100),category:categories.indexOf(read('タグ1'))>=0?read('タグ1'):'その他',platform:platforms.indexOf(read('タグ2'))>=0?read('タグ2'):'その他',kind:pack?'pack':'single',productUrl:productUrl,products:products,thumbnail:thumb});
  }catch(_){} // Fail closed: malformed/private public fields are never exported.
 });
 return {ok:true,v:1,updatedAt:new Date(now).toISOString(),refreshSeconds:60,items:items.reverse()};
}
function catalogThumbnail_(id,key){var m=id.match(/^bingo-image:([a-f0-9-]{36})$/);if(!m)return '';var f=imageFile_(imageFolder_(),m[1]);if(!f)return '';var meta=JSON.parse(f.getDescription());if(meta.kind!=='bingo-thumbnail'||meta.state!=='claimed'||meta.row!==key)return '';var bytes=f.getBlob().getBytes();if(bytes.length>30000)return '';return 'data:image/jpeg;base64,'+Utilities.base64Encode(bytes);}
function catalogFile_(){var files=imageFolder_().getFilesByName('public-catalog-v1.json');return files.hasNext()?files.next():null;}
function catalogResponse_(){
 var lock=LockService.getScriptLock();
 try{
  var book=receiptBook_(),file=catalogFile_(),now=Date.now(); // Sharing check applies even to cached responses.
  if(file&&now-file.getLastUpdated().getTime()<CATALOG_TTL_MS)return imageJson_(JSON.parse(file.getBlob().getDataAsString('UTF-8')));
  if(!lock.tryLock(10000))return imageJson_({ok:false,code:'BUSY'});
  file=catalogFile_();if(file&&now-file.getLastUpdated().getTime()<CATALOG_TTL_MS)return imageJson_(JSON.parse(file.getBlob().getDataAsString('UTF-8')));
  var data=catalogBuild_(catalogSource_(book),catalogThumbnail_,now),text=JSON.stringify(data);if(text.length>6000000)throw Error('LIMIT');
  if(file)file.setContent(text);else imageFolder_().createFile(Utilities.newBlob(text,'application/json','public-catalog-v1.json'));
  return imageJson_(data);
 }catch(_){return imageJson_({ok:false,code:'UNAVAILABLE'});}finally{try{lock.releaseLock();}catch(_){}}
}
function configurePrizeCatalog(){var sheet=catalogSource_(receiptBook_()),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];ensurePrizeColumn_(sheet,headers,'一覧公開');console.log('景品一覧を設定しました。有効な投稿は公開対象です。一覧公開を「非公開」にすると次回の更新で除外されます。');}
function refreshPrizeCatalog(){var f=catalogFile_();if(f){var lock=LockService.getScriptLock();lock.waitLock(30000);try{var data=catalogBuild_(catalogSource_(receiptBook_()),catalogThumbnail_,Date.now()),text=JSON.stringify(data);if(text.length>6000000)throw Error('LIMIT');f.setContent(text);}finally{lock.releaseLock();}}else catalogResponse_();}

// Lightweight visitor API. Image bytes are only downloaded by the Pages publisher.
function catalogInfoResponse_(){
 var response=catalogResponse_(),data=JSON.parse(response.getContent());
 if(!data.ok)return imageJson_(data);
 data.items.forEach(function(p){var thumbnail=p.thumbnail||'';delete p.thumbnail;p.thumbnailUrl=/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(thumbnail)?'https://watbox.net/bingo/catalog/media/'+p.id+'-'+imageHash_(thumbnail).slice(0,20)+'.jpg':'';});
 return imageJson_(data);
}
