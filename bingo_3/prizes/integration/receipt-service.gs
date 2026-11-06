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
function doGet(){return receiptJson_({ok:false,code:'METHOD'});}
function doPost(e){
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
