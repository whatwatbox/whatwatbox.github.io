/** Separate project from BOOTH metadata. Owner execution; public POST upload, receipt and authenticated submission restore.
 * Configure IMAGE_FOLDER_ID (dedicated PRIVATE folder) and RESPONSE_SHEET_ID
 * in Script Properties before deployment. Public catalog exports only approved public fields and claimed thumbnails; edit IDs authorize private snapshot restore.
 */
var IMAGE_DAILY_LIMIT=100,IMAGE_PENDING_LIMIT=1000,IMAGE_MAX_AGE_DAYS=7;
var IMAGE_INPUT_COLUMN='サムネ画像ID'; // Legacy column; new forms carry the image ID in 内部情報.
function imageJson_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function imageFolder_(){var id=PropertiesService.getScriptProperties().getProperty('IMAGE_FOLDER_ID');if(!id)throw Error('SETUP');return DriveApp.getFolderById(id);}
function imageHash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function imageFile_(folder,token){var files=folder.getFilesByName(token+'.jpg');return files.hasNext()?files.next():null;}
function doGet(e){if(e&&e.parameter&&e.parameter.action==='publicCatalogInfo')return catalogInfoResponse_();if(e&&e.parameter&&e.parameter.action==='publicCatalog')return catalogResponse_();return imageJson_({ok:false,code:'METHOD'});}
function doPost(e){
  if((e&&e.postData&&e.postData.contents||'').length>1900000)return imageJson_({ok:false,code:'SIZE'});
  try{var request=JSON.parse(e&&e.postData&&e.postData.contents||'{}');if(Object.prototype.hasOwnProperty.call(request,'code'))return receiptPost_(e);if(['saveSubmissionDraft','restoreSubmission','submissionStatus'].indexOf(request.action)>=0)return submissionPost_(request);}catch(_){}
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return imageJson_({ok:false,code:'BUSY'});
  try{
    var raw=e&&e.postData&&e.postData.contents||'';if(raw.length>41000)throw Error('INVALID');
    var data=JSON.parse(raw),image=data.image;
    if(typeof image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)||image.length>40000)throw Error('INVALID');
    var hash=imageHash_(image),requestId=data.requestId;if(!/^[a-f0-9-]{36}$/.test(requestId||''))throw Error('INVALID');
    var bytes=decodePrizeJpeg_(image),folder=imageFolder_(),props=PropertiesService.getScriptProperties();
    // Validate JPEG frame as 512x512 only for the upload API.
    if(prizeJpegDimensions_(bytes).height!==512)throw Error('INVALID');
    var cache=CacheService.getScriptCache(),cached=cache.get('image:'+requestId);
    if(cached){var cachedFile=imageFile_(folder,cached);if(cachedFile){var cachedMeta=JSON.parse(cachedFile.getDescription());if(cachedMeta.hash!==hash)throw Error('INVALID');if(cachedMeta.requestId===requestId)return imageJson_({ok:true,imageId:'bingo-image:'+cached});}}
    var day=Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd'),countKey='UPLOAD_COUNT',counter=JSON.parse(props.getProperty(countKey)||'{}');
    if(counter.day!==day)counter={day:day,count:0};if(counter.count>=IMAGE_DAILY_LIMIT)throw Error('LIMIT');
    var files=folder.getFiles(),pending=0,seen=0;
    while(files.hasNext()){
      var f=files.next();if(++seen>3000)throw Error('LIMIT');
      if(!/^[a-f0-9-]{36}\.jpg$/.test(f.getName()))continue;
      var meta;try{meta=JSON.parse(f.getDescription());}catch(_){continue;}
      if(meta.kind!=='bingo-thumbnail')continue;
      if(meta.requestId===requestId){if(meta.hash!==hash)throw Error('INVALID');cache.put('image:'+requestId,f.getName().slice(0,-4),21600);return imageJson_({ok:true,imageId:'bingo-image:'+f.getName().slice(0,-4)});}
      if(meta.state==='pending')pending++;
    }
    if(pending>=IMAGE_PENDING_LIMIT)throw Error('LIMIT');
    // Count before creating; failures cannot exceed the daily storage allowance.
    counter.count++;props.setProperty(countKey,JSON.stringify(counter));
    var token=Utilities.getUuid().toLowerCase(),file=folder.createFile(Utilities.newBlob(bytes,'image/jpeg',token+'.jpg'));
    file.setDescription(JSON.stringify({kind:'bingo-thumbnail',hash:hash,requestId:requestId,state:'pending',created:Date.now()}));
    cache.put('image:'+requestId,token,21600);
    return imageJson_({ok:true,imageId:'bingo-image:'+token});
  }catch(err){return imageJson_({ok:false,code:err.message==='LIMIT'?'LIMIT':'INVALID'});}
  finally{lock.releaseLock();}
}
function processPrizeImageFormSubmit_(e){
  if(!e||!e.range)throw Error('Use spreadsheet form-submit trigger');
  var expected=PropertiesService.getScriptProperties().getProperty('RESPONSE_SHEET_ID');
  if(!expected||e.range.getSheet().getParent().getId()!==expected)throw Error('Wrong spreadsheet');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var sheet=e.range.getSheet(),row=e.range.getRow(),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var input=headers.indexOf(IMAGE_INPUT_COLUMN)+1;var internalIndex=headers.indexOf('内部情報'),internal={};if(internalIndex>=0)try{internal=JSON.parse(sheet.getRange(row,internalIndex+1).getValue()||'{}');}catch(_){}
    var output=ensurePrizeColumn_(sheet,headers,'サムネ画像ファイル'),state=ensurePrizeColumn_(sheet,headers,'画像保存結果');
    if(sheet.getRange(row,output).getValue())return;
    try{
      var value=String(internal.imageId||(input?sheet.getRange(row,input).getValue():'')||'').trim(),m=value.match(/^bingo-image:([a-f0-9-]{36})$/);if(!m)throw Error('Invalid ID');
      var file=imageFile_(imageFolder_(),m[1]);if(!file)throw Error('Missing file');
      var meta=JSON.parse(file.getDescription()),rowKey=sheet.getSheetId()+':'+row;
      if(meta.kind!=='bingo-thumbnail'||(meta.state==='claimed'&&meta.row!==rowKey))throw Error('Already claimed');
      meta.state='claimed';meta.row=rowKey;file.setDescription(JSON.stringify(meta));
      sheet.getRange(row,output).setValue(file.getUrl());sheet.getRange(row,state).setValue('保存済み');
    }catch(_){sheet.getRange(row,state).setValue('画像IDを確認してください（未保存・期限切れ・重複）');}
  }finally{lock.releaseLock();}
}
function cleanupPendingPrizeImages(){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var files=imageFolder_().getFiles(),cutoff=Date.now()-IMAGE_MAX_AGE_DAYS*86400000;
    while(files.hasNext()){
      var f=files.next();if(!/^[a-f0-9-]{36}\.jpg$/.test(f.getName()))continue;
      var m;try{m=JSON.parse(f.getDescription());}catch(_){continue;}
      if(m.kind==='bingo-thumbnail'&&m.state==='pending'&&Number.isFinite(m.created)&&m.created<cutoff)f.setTrashed(true);
    }
  }finally{lock.releaseLock();}
  cleanupSubmissionDrafts_();
}
function installPrizeImageTriggers(){
  var props=PropertiesService.getScriptProperties(),sheetId=props.getProperty('RESPONSE_SHEET_ID');
  if(!sheetId)throw Error('Set RESPONSE_SHEET_ID');imageFolder_();
  var existing=ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();});
  if(existing.indexOf('onPrizeImageFormSubmit')<0)ScriptApp.newTrigger('onPrizeImageFormSubmit').forSpreadsheet(sheetId).onFormSubmit().create();
  if(existing.indexOf('cleanupPendingPrizeImages')<0)ScriptApp.newTrigger('cleanupPendingPrizeImages').timeBased().everyDays(1).create();
}
function prizeJpegDimensions_(bytes){
  var u=bytes.map(function(b){return b&255;}),i=2;
  while(i<u.length-4){if(u[i++]!==255)throw Error('Invalid marker');while(u[i]===255)i++;var marker=u[i++];if(marker===218||marker===217)break;if(marker===1||(marker>=208&&marker<=215))continue;var len=(u[i]<<8)|u[i+1];if(len<2||i+len>u.length)throw Error('Invalid length');if([192,193,194].indexOf(marker)>=0)return {width:(u[i+5]<<8)|u[i+6],height:(u[i+3]<<8)|u[i+4]};i+=len;}throw Error('Invalid JPEG');
}

function ensurePrizeColumn_(sheet,headers,title){
  var col=headers.indexOf(title)+1;if(col)return col;
  headers.push(title);col=headers.length;sheet.getRange(1,col).setValue(title);return col;
}
function decodePrizeJpeg_(value){
  if(value.length>40000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Invalid image');
  var bytes=Utilities.base64Decode(value.slice(value.indexOf(',')+1));
  var u=bytes.map(function(b){return b&255;});
  if(u.length<12||u[0]!==255||u[1]!==216||u[u.length-2]!==255||u[u.length-1]!==217)throw new Error('Invalid JPEG');
  var i=2,found=false;
  while(i<u.length-4){
    if(u[i++]!==255)throw new Error('Invalid marker');
    while(u[i]===255)i++;
    var marker=u[i++];if(marker===218||marker===217)break;
    if(marker===1||(marker>=208&&marker<=215))continue;
    var len=(u[i]<<8)|u[i+1];if(len<2||i+len>u.length)throw new Error('Invalid length');
    if([192,193,194].indexOf(marker)!==-1){
      if(len<8)throw new Error('Invalid frame');
      var height=(u[i+3]<<8)|u[i+4],width=(u[i+5]<<8)|u[i+6];
      if(width!==512||[350,512].indexOf(height)===-1)throw new Error('Invalid dimensions');found=true;break;
    }i+=len;
  }
  if(!found)throw new Error('Missing frame');return bytes;
}

// Receipt route: same private spreadsheet; no new OAuth scope.
/** Separate owner-executed GAS web app. Sheets data access plus Drive sharing-metadata verification.
 * Set RESPONSE_SHEET_ID in Script Properties. Never publish/share the spreadsheet.
 * Public API: POST {code}. GET does not return prize information.
 * preparePrizeReceipts runs manually in the editor, never through the public API.
 */
var RECEIPT_HEADERS=['公開状態','景品ID','景品名','受取コード','コードハッシュ','商品データ（非公開）','回答位置','画像ID','最終表示日時'];
function receiptJson_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function receiptHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function receiptCode_(value){var raw=String(value||'').trim().replace(/^B3-/i,'').replace(/[\s-]/g,'').toLowerCase();return /^[a-f0-9]{32}$/.test(raw)?raw:'';}
function receiptGift_(value){var s=String(value||'').trim();if(!/^https:\/\/booth\.pm\/gifts\/[a-zA-Z0-9_-]+\/?$/.test(s))throw Error('Invalid gift');return s.replace(/\/$/,'');}
function receiptProduct_(value){var s=String(value||'').trim();if(!/^https:\/\/(?:[a-z0-9-]+\.)?booth\.pm\/(?:[a-z]{2}\/)?items\/\d{1,12}$/.test(s))throw Error('Invalid product');return s;}
function receiptBook_(){var id=PropertiesService.getScriptProperties().getProperty('RESPONSE_SHEET_ID');if(!id)throw Error('Missing sheet');if(DriveApp.getFileById(id).getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('Response sheet must be restricted');return SpreadsheetApp.openById(id);}
function receiptManagement_(book){var sheet=book.getSheetByName('景品受取管理');if(!sheet){sheet=book.insertSheet('景品受取管理');sheet.getRange(1,1,1,RECEIPT_HEADERS.length).setValues([RECEIPT_HEADERS]);sheet.setFrozenRows(1);sheet.getRange('A:D').setNumberFormat('@');}return sheet;}
function receiptPack_(value){
  if(!value)return null;
  if(typeof value!=='string'||value.length>6000||!/^bingo-pack:v1:[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Invalid pack');
  var decoded=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value.slice(14)),'application/gzip','pack.json.gz')).getDataAsString('UTF-8');
  if(decoded.length>15000)throw Error('Oversized pack');var data=JSON.parse(decoded);
  if(data.v!==1||!Array.isArray(data.items)||data.items.length<2||data.items.length>10)throw Error('Invalid pack');
  return data.items.map(function(item){return {name:String(item.name||'').slice(0,160),url:receiptProduct_(item.url),shop:String(item.shop||'').slice(0,120)};});
}
function preparePrizeReceipts(){
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var book=receiptBook_(),management=receiptManagement_(book),sheets=book.getSheets().filter(function(s){return s.getName()!=='景品受取管理'&&s.getLastRow()>0;});
    var sources=sheets.filter(function(s){var h=s.getRange(1,1,1,s.getLastColumn()).getValues()[0];return h.indexOf('ギフトURL')>=0&&h.indexOf('景品名')>=0;});
    if(sources.length!==1)throw Error('Identify exactly one response sheet');
    var source=sources[0],rows=source.getDataRange().getValues(),headers=rows.shift(),existing=management.getDataRange().getValues().slice(1),keys={},used={};
    existing.forEach(function(row){keys[String(row[6])]=true;if(row[0]==='停止')return;try{JSON.parse(row[5]).forEach(function(i){used[receiptGift_(i.giftUrl)]=true;});}catch(_){throw Error('Invalid management data');}});
    var additions=[],skipped=0;
    rows.forEach(function(row,index){
      var key=source.getSheetId()+':'+(index+2);if(keys[key])return;
      try{
        var read=function(name){var i=headers.indexOf(name);return i<0?'':String(row[i]||'').trim();};
        var submissionState=read('投稿状態');if(submissionState&&submissionState!=='有効')return;var internal={};try{internal=JSON.parse(read('内部情報')||'{}');}catch(_){}
        var title=read('景品名');if(!title||title.length>160)throw Error('Invalid title');
        var gifts=read('ギフトURL').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean).map(receiptGift_);
        if(!gifts.length||gifts.length>10)throw Error('Invalid gift count');
        var local={};gifts.forEach(function(g){if(used[g]||local[g])throw Error('Duplicate gift');local[g]=true;});
        var pack=receiptPack_(read('パック内容')||internal.packData||'');
        if((pack&&pack.length!==gifts.length)||(!pack&&gifts.length!==1))throw Error('Gift count mismatch');
        var productUrl=read('商品URL(任意)');if(productUrl)productUrl=receiptProduct_(productUrl);
        var products=gifts.map(function(g,i){return {name:pack?pack[i].name:title,productUrl:pack?pack[i].url:productUrl,shop:pack?pack[i].shop:read('景品元名'),giftUrl:g};});
        var raw=Utilities.getUuid().replace(/-/g,'').toLowerCase(),code='B3-'+raw.match(/.{1,8}/g).join('-'),prizeId='prize-'+Utilities.getUuid();
        additions.push(['準備',prizeId,title,code,receiptHash_(raw),JSON.stringify(products),key,read('サムネ画像ID')||internal.imageId||'','']);
        gifts.forEach(function(g){used[g]=true;});keys[key]=true;
      }catch(_){skipped++;}
    });
    if(additions.length){var range=management.getRange(management.getLastRow()+1,1,additions.length,RECEIPT_HEADERS.length);range.setNumberFormat('@');range.setValues(additions.map(function(row){return row.map(function(v){return /^[=+\-@]/.test(String(v))?"'"+v:v;});}));}
    console.log('受取用景品の追加件数: '+additions.length+' / 要確認: '+skipped+'。管理シートの公開状態を「有効」にした景品だけ受取可能です。');
  }finally{lock.releaseLock();}
}

function receiptPost_(e){
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return receiptJson_({ok:false,code:'BUSY'});
  try{
    var body=e&&e.postData&&e.postData.contents||'';if(body.length>300)throw Error('Invalid');
    var input=JSON.parse(body),code=receiptCode_(input.code);if(!code)throw Error('Invalid');
    var props=PropertiesService.getScriptProperties(),day=Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd'),counter=JSON.parse(props.getProperty('RECEIPT_REQUEST_COUNT')||'{}');
    if(counter.day!==day)counter={day:day,count:0};if(counter.count>=3000)return receiptJson_({ok:false,code:'LIMIT'});counter.count++;props.setProperty('RECEIPT_REQUEST_COUNT',JSON.stringify(counter));
    var book=receiptBook_(),sheet=book.getSheetByName('景品受取管理');if(!sheet)throw Error('Invalid');
    var rows=sheet.getDataRange().getValues(),hash=receiptHash_(code),found=-1;
    for(var i=1;i<rows.length;i++)if(rows[i][4]===hash){if(found!==-1)throw Error('Duplicate');found=i;}
    if(found<0||rows[found][0]!=='有効')throw Error('Invalid');
    var items=JSON.parse(rows[found][5]);if(!Array.isArray(items)||!items.length||items.length>10)throw Error('Invalid');
    var products=items.map(function(item){return {name:String(item.name||'商品').slice(0,160),shop:String(item.shop||'').slice(0,120),productUrl:item.productUrl?receiptProduct_(item.productUrl):'',giftUrl:receiptGift_(item.giftUrl)};});
    // Viewing never consumes or redeems the gift. Codes remain valid until disabled by the organiser.
    sheet.getRange(found+1,9).setValue(new Date());
    return receiptJson_({ok:true,title:String(rows[found][2]).slice(0,160),items:products});
  }catch(_){return receiptJson_({ok:false,code:'NOT_FOUND'});}finally{lock.releaseLock();}
}

/* Submission lifecycle. Private Drive snapshots; Google Forms response-copy email
 * carries the edit ID. No MailApp/Gmail permission, no gift URLs in snapshots.
 */
function submissionFile_(prefix,id){if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('INVALID');var files=imageFolder_().getFilesByName(prefix+'-'+id+'.json');if(!files.hasNext())throw Error('NOT_FOUND');return files.next();}
function submissionRead_(file){return JSON.parse(file.getBlob().getDataAsString('UTF-8'));}
function submissionWrite_(file,data){file.setContent(JSON.stringify(data));}
function submissionKey_(key,prefix){var m=String(key||'').match(new RegExp('^'+prefix+'-([a-f0-9]{32})-([a-f0-9]{32})$'));if(!m)throw Error('NOT_FOUND');return {id:m[1],secret:m[2]};}
function submissionUuid_(){return Utilities.getUuid().replace(/-/g,'').toLowerCase();}
function submissionRoot_(key){var parsed=submissionKey_(key,'B3E'),file=submissionFile_('submission',parsed.id),root=submissionRead_(file);if(root.editHash!==imageHash_(parsed.secret))throw Error('NOT_FOUND');return {file:file,data:root,id:parsed.id};}
function submissionActive_(book,key){var sheet=book.getSheetByName('景品受取管理');if(!sheet)return false;var rows=sheet.getDataRange().getValues();return rows.some(function(r){return r[6]===key&&r[0]==='有効';});}
function submissionSnapshot_(data){
  if(!data||data.v!==1||!data.values||!Array.isArray(data.layers)||!data.layers.length||data.layers.length>12)throw Error('INVALID');
  var allowed=['productUrl','productName','shopName','providerName','contact','awardName','price','clusterId','category','platform','guestRequest','description'],values={};
  allowed.forEach(function(k){values[k]=String(data.values[k]||'').slice(0,k==='description'?3000:250);});
  var layers=data.layers.map(function(l){
    if(!l||['image','text'].indexOf(l.type)<0)throw Error('INVALID');
    var fonts=['Mochiy Pop One','M PLUS Rounded 1c','M PLUS 2','Dela Gothic One'];
    var clean={productKey:/^pack:[1-9][0-9]{0,5}$/.test(l.productKey||'')?l.productKey:null,font:fonts.indexOf(l.font)>=0?l.font:'M PLUS Rounded 1c',stroke:/^#[a-f0-9]{6}$/i.test(l.stroke||'')?l.stroke:'#202020',type:l.type,name:String(l.name||'').slice(0,100),text:String(l.text||'').slice(0,200),color:/^#[a-f0-9]{6}$/i.test(l.color||'')?l.color:'#ffffff',visible:l.visible!==false};
    ['x','y','size','opacity','rotation'].forEach(function(k){var n=Number(l[k]);if(!Number.isFinite(n)||Math.abs(n)>1000)throw Error('INVALID');clean[k]=n;});
    if(l.type==='image'){if(typeof l.imageData!=='string'||l.imageData.length>500000||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(l.imageData))throw Error('INVALID');clean.imageData=l.imageData;}
    return clean;
  });
  var items=Array.isArray(data.items)?data.items:[];if(items.length>10)throw Error('INVALID');
  items=items.map(function(i){return {id:Number.isSafeInteger(i.id)&&i.id>0&&i.id<1000000?i.id:undefined,price:String(i.price||'').slice(0,9),product:{name:String(i.product.name||'').slice(0,160),url:receiptProduct_(i.product.url),shop:String(i.product.shop||'').slice(0,120),price:String(i.price||'').slice(0,9),images:[]}};});
  if(data.kind==='pack'&&items.length<2)throw Error('INVALID');
  var result={v:1,values:values,layers:layers,kind:data.kind==='pack'?'pack':'single',items:items};
  if(JSON.stringify(result).length>1800000)throw Error('SIZE');return result;
}
function submissionLimit_(){var p=PropertiesService.getScriptProperties(),day=Utilities.formatDate(new Date(),'UTC','yyyy-MM-dd'),c=JSON.parse(p.getProperty('SUBMISSION_DRAFT_COUNT')||'{}');if(c.day!==day)c={day:day,count:0};if(c.count>=150)throw Error('LIMIT');c.count++;p.setProperty('SUBMISSION_DRAFT_COUNT',JSON.stringify(c));}
function submissionPost_(request){
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return imageJson_({ok:false,code:'BUSY'});
  try{
    var book=receiptBook_(); // Fail closed if the response spreadsheet becomes public.
    if(request.action==='submissionStatus'){
      var key=submissionKey_(request.statusToken,'B3S'),file=submissionFile_('draft',key.id),meta=JSON.parse(file.getDescription());
      if(meta.statusHash!==imageHash_(key.secret))throw Error('NOT_FOUND');
      return imageJson_({ok:true,state:meta.state,message:meta.message||''});
    }
    if(request.action==='restoreSubmission'){
      var loaded=submissionRoot_(request.editId),root=loaded.data;
      if(!root.latestDraft||!root.rowKey)throw Error('NOT_FOUND');if(submissionActive_(book,root.rowKey))throw Error('LOCKED');
      var snapshot=submissionRead_(submissionFile_('draft',root.latestDraft)).snapshot;
      var parts=root.rowKey.split(':'),sheet=book.getSheets().filter(function(s){return String(s.getSheetId())===parts[0];})[0];if(!sheet)throw Error('NOT_FOUND');
      var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],row=sheet.getRange(Number(parts[1]),1,1,headers.length).getValues()[0];
      var read=function(name){var i=headers.indexOf(name);return i<0?'':String(row[i]==null?'':row[i]);};
      var map={productName:'景品名',shopName:'景品元名',providerName:'応募者名',awardName:'賞の名前',price:'参考価格',clusterId:'clusterユーザーID',contact:'Xアカウント',category:'タグ1',platform:'タグ2',guestRequest:'イベントゲスト枠希望',productUrl:'商品URL(任意)',description:'その他'};
      Object.keys(map).forEach(function(k){snapshot.values[k]=read(map[k]);if(k==='guestRequest'&&!snapshot.values[k])snapshot.values[k]=read('ゲスト枠希望');});
      return imageJson_({ok:true,snapshot:snapshot,gifts:read('ギフトURL').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean),revision:root.revision});
    }
    if(request.action!=='saveSubmissionDraft')throw Error('INVALID');
    var snapshot=submissionSnapshot_(request.snapshot),loaded,root,editId;
    if(request.editId){loaded=submissionRoot_(request.editId);root=loaded.data;if(submissionActive_(book,root.rowKey))throw Error('LOCKED');if(Number(request.revision)!==root.revision)throw Error('STALE');editId=request.editId;}
    else{var rootId=submissionUuid_(),secret=submissionUuid_();root={v:1,id:rootId,editHash:imageHash_(secret),revision:0,created:Date.now(),latestDraft:'',rowKey:'',email:''};editId='B3E-'+rootId+'-'+secret;}
    submissionLimit_();
    if(!loaded){var rootFile=imageFolder_().createFile(Utilities.newBlob(JSON.stringify(root),'application/json','submission-'+root.id+'.json'));loaded={file:rootFile,data:root,id:root.id};}
    var draftId=submissionUuid_(),statusSecret=submissionUuid_(),draft={v:1,rootId:root.id,baseRevision:root.revision,snapshot:snapshot,created:Date.now()};
    var file=imageFolder_().createFile(Utilities.newBlob(JSON.stringify(draft),'application/json','draft-'+draftId+'.json'));
    file.setDescription(JSON.stringify({kind:'bingo-submission',rootId:root.id,statusHash:imageHash_(statusSecret),state:'pending',created:Date.now()}));
    root.lastDraftAt=Date.now();submissionWrite_(loaded.file,root);
    return imageJson_({ok:true,draftId:draftId,editId:editId,revision:root.revision,statusToken:'B3S-'+draftId+'-'+statusSecret});
  }catch(error){return imageJson_({ok:false,code:['LOCKED','STALE','LIMIT','SIZE'].indexOf(error.message)>=0?error.message:'NOT_FOUND'});}finally{lock.releaseLock();}
}
function submissionInternal_(read){try{var value=JSON.parse(read('内部情報'));return value&&value.v===2?value:null;}catch(_){return null;}}
function onPrizeSubmissionLifecycle_(e){
  var expected=PropertiesService.getScriptProperties().getProperty('RESPONSE_SHEET_ID');if(!e||!e.range||e.range.getSheet().getParent().getId()!==expected)throw Error('Wrong spreadsheet');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    var book=receiptBook_(),sheet=e.range.getSheet(),row=e.range.getRow(),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],values=sheet.getRange(row,1,1,headers.length).getValues()[0];
    var read=function(name){var i=headers.indexOf(name);return i<0?'':String(values[i]==null?'':values[i]).trim();},internal=submissionInternal_(read);
    if(!internal){if(headers.indexOf('内部情報')>=0&&read('内部情報')){sheet.getRange(row,ensurePrizeColumn_(sheet,headers,'投稿状態')).setValue('要確認');return false;}return true;}
    var statusCol=ensurePrizeColumn_(sheet,headers,'投稿状態'),loaded,root,draftFile,draft,meta,authorized=false;
    try{
      loaded=submissionRoot_(internal.editId);root=loaded.data;draftFile=submissionFile_('draft',internal.draftId);draft=submissionRead_(draftFile);meta=JSON.parse(draftFile.getDescription());
      if(draft.rootId!==root.id||internal.editId!==read('修正用ID'))throw Error('Invalid draft');
      authorized=true;
      if(root.latestDraft===internal.draftId&&root.rowKey===sheet.getSheetId()+':'+row){meta.state='submitted';meta.message='';draftFile.setDescription(JSON.stringify(meta));sheet.getRange(row,statusCol).setValue('有効');return true;}
      if(meta.state==='submitted'){sheet.getRange(row,statusCol).setValue('重複');return false;}
      if(root.revision!==draft.baseRevision||Number(internal.revision)!==root.revision)throw Error('新しい投稿があるため、このフォームは更新できません。修正用IDから読み込み直してください。');
      if(root.rowKey&&submissionActive_(book,root.rowKey))throw Error('運営が景品を公開済みのため、W@へ修正をご依頼ください。');
      var email=read('メールアドレス')||read('メール');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('確認用メールアドレスを確認できません。');
      if(root.email&&root.email.toLowerCase()!==email.toLowerCase())throw Error('元の投稿と同じGoogleアカウントで送信してください。');
      var gifts=read('ギフトURL').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean).map(receiptGift_),pack=receiptPack_(internal.packData||'');
      if(new Set(gifts).size!==gifts.length||!gifts.length||gifts.length>10||(pack?pack.length!==gifts.length:gifts.length!==1))throw Error('ギフトURLの件数・重複をご確認ください。');
      if(!/^bingo-image:[a-f0-9-]{36}$/.test(internal.imageId||''))throw Error('画像IDをご確認ください。');
      if(root.rowKey){var parts=root.rowKey.split(':'),oldSheet=book.getSheets().filter(function(s){return String(s.getSheetId())===parts[0];})[0];if(oldSheet){var oldHeaders=oldSheet.getRange(1,1,1,oldSheet.getLastColumn()).getValues()[0];oldSheet.getRange(Number(parts[1]),ensurePrizeColumn_(oldSheet,oldHeaders,'投稿状態')).setValue('差替済み');}
        var management=book.getSheetByName('景品受取管理');if(management){var receipts=management.getDataRange().getValues();receipts.forEach(function(r,i){if(i&&r[6]===root.rowKey)management.getRange(i+1,1).setValue('停止');});}}
      root.latestDraft=internal.draftId;root.rowKey=sheet.getSheetId()+':'+row;root.revision++;root.email=email;
      submissionWrite_(loaded.file,root);meta.state='submitted';meta.message='';draftFile.setDescription(JSON.stringify(meta));sheet.getRange(row,statusCol).setValue('有効');return true;
    }catch(error){sheet.getRange(row,statusCol).setValue('要確認');if(authorized&&draftFile&&meta&&meta.state!=='submitted'){meta.state='rejected';meta.message=String(error.message||'入力内容をご確認ください。').slice(0,200);draftFile.setDescription(JSON.stringify(meta));}return false;}
  }finally{lock.releaseLock();}
}
function onPrizeImageFormSubmit(e){if(onPrizeSubmissionLifecycle_(e))processPrizeImageFormSubmit_(e);}
function cleanupSubmissionDrafts_(){
  var files=imageFolder_().getFiles(),cutoff=Date.now()-7*86400000;
  while(files.hasNext()){var f=files.next();if(/^submission-[a-f0-9]{32}\.json$/.test(f.getName())){try{var root=submissionRead_(f);if(root.revision===0&&(root.lastDraftAt||root.created)<cutoff)f.setTrashed(true);}catch(_){}continue;}if(!/^draft-[a-f0-9]{32}\.json$/.test(f.getName()))continue;try{var m=JSON.parse(f.getDescription());if(m.kind==='bingo-submission'&&m.state!=='submitted'&&m.created<cutoff)f.setTrashed(true);}catch(_){}}
}

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
