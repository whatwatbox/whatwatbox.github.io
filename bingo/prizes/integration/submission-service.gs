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
