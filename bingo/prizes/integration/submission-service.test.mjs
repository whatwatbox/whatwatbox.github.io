import {fileURLToPath} from 'node:url';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('./',import.meta.url));
// Reuse the receipt test's isolated spreadsheet mock; no live service is called.
let fixture=fs.readFileSync(root+'receipt-service.test.mjs','utf8');fixture=fixture.replace("const root=fileURLToPath(new URL('../../',import.meta.url));","const root="+JSON.stringify(fileURLToPath(new URL('../../',import.meta.url)))+";");fixture+='\nexport {c,source,sheets,book};';
const {c,source,sheets,book}=await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
const files=[];const folder={getFilesByName:name=>{const found=files.filter(f=>f.name===name&&!f.trashed);let i=0;return {hasNext:()=>i<found.length,next:()=>found[i++]};},createFile:blob=>{const file={name:blob.name,data:blob.data,description:'',getName(){return this.name},getBlob(){return {getDataAsString:()=>this.data}},setContent(v){this.data=v},getDescription(){return this.description},setDescription(v){this.description=v},setTrashed(v){this.trashed=v}};files.push(file);return file;}};
c.imageFolder_=()=>folder;c.imageHash_=c.receiptHash_;c.imageJson_=c.receiptJson_;
const receiptBlob=c.Utilities.newBlob;c.Utilities.newBlob=(data,type,name)=>type==='application/gzip'?receiptBlob(data,type,name):name?{data:typeof data==='string'?data:Buffer.from(data).toString(),type,name}:Buffer.from(data);
const imageSource=fs.readFileSync(root+'image-upload-service.gs','utf8');vm.runInContext(imageSource.slice(imageSource.indexOf('function ensurePrizeColumn_'),imageSource.indexOf('function decodePrizeJpeg_')),c);
source.getParent=()=>({getId:()=> 'sheet'});
source.values[0].push('内部情報','修正用ID','メールアドレス','投稿状態','イベントゲスト枠希望','参考価格');
vm.runInContext(fs.readFileSync(root+'submission-service.gs','utf8'),c);
const snapshot={v:1,kind:'single',values:{productName:'景品',price:'0',giftUrl:'NEVER_STORE_THIS'},items:[],layers:[{type:'text',font:'Dela Gothic One',stroke:'#123456',text:'文字',color:'#ffffff',visible:true,x:50,y:50,size:36,opacity:100,rotation:0}]};
const create=(extra={})=>c.submissionPost_({action:'saveSubmissionDraft',snapshot,...extra});
const status=token=>c.submissionPost_({action:'submissionStatus',statusToken:token});
const restore=id=>c.submissionPost_({action:'restoreSubmission',editId:id});
const imageId='bingo-image:00000000-0000-4000-8000-000000000001';
function submit(d,email='test@example.com',gift='https://booth.pm/gifts/lifecycle-test'){
  const values={'内部情報':JSON.stringify({v:2,editId:d.editId,draftId:d.draftId,revision:d.revision,imageId,packData:''}),'修正用ID':d.editId,'メールアドレス':email,'ギフトURL':gift,'景品名':'フォーム上の景品名','参考価格':0,'イベントゲスト枠希望':'希望します'};
  const row=source.values[0].map(k=>values[k]??'');source.values.push(row);const n=source.values.length;
  const ok=c.onPrizeSubmissionLifecycle_({range:{getSheet:()=>source,getRow:()=>n}});return {ok,row:n};
}
const first=create();assert.equal(first.ok,true);assert.equal(status(first.statusToken).state,'pending');assert.ok(!files.some(f=>f.data.includes('NEVER_STORE_THIS')));assert.equal(restore(first.editId).ok,false);
const original=submit(first);assert.equal(original.ok,true);assert.equal(status(first.statusToken).state,'submitted');const restored=restore(first.editId);assert.equal(restored.ok,true);assert.equal(restored.snapshot.values.productName,'フォーム上の景品名');assert.equal(restored.snapshot.values.price,'0');assert.equal(restored.snapshot.layers[0].font,'Dela Gothic One');assert.equal(restored.snapshot.layers[0].stroke,'#123456');assert.equal(restored.gifts[0],'https://booth.pm/gifts/lifecycle-test');
const beforeRetry=restore(first.editId).revision;assert.equal(c.onPrizeSubmissionLifecycle_({range:{getSheet:()=>source,getRow:()=>original.row}}),true);assert.equal(restore(first.editId).revision,beforeRetry);
const correction=create({editId:first.editId,revision:restored.revision});assert.equal(correction.ok,true);assert.equal(submit(correction).ok,true);assert.equal(source.values[original.row-1][source.values[0].indexOf('投稿状態')],'差替済み');assert.equal(status(correction.statusToken).state,'submitted');
const duplicate=submit(correction);assert.equal(duplicate.ok,false);assert.equal(status(correction.statusToken).state,'submitted');assert.equal(source.values[duplicate.row-1][source.values[0].indexOf('投稿状態')],'重複');
const stale=create({editId:first.editId,revision:0});assert.equal(stale.code,'STALE');
const wrongEmail=create({editId:first.editId,revision:restore(first.editId).revision});assert.equal(submit(wrongEmail,'other@example.com').ok,false);assert.equal(status(wrongEmail.statusToken).state,'rejected');
const pendingVictim=create();const unrelated=create();assert.equal(submit({...unrelated,draftId:pendingVictim.draftId}).ok,false);assert.equal(status(pendingVictim.statusToken).state,'pending');const malicious={...unrelated,draftId:wrongEmail.draftId};assert.equal(submit(malicious).ok,false);assert.equal(status(wrongEmail.statusToken).state,'rejected');
assert.equal(status(first.statusToken.slice(0,-1)+'f').ok,false);
const rootRecord=c.submissionRoot_(first.editId).data;const management=sheets.find(s=>s.getName()==='景品受取管理');management.values.push(['有効','active','title','code','hash','[]',rootRecord.rowKey,'','']);assert.equal(restore(first.editId).code,'LOCKED');
console.log('Lifecycle: pending/confirmed submission, canonical field restore, zero price, revision replacement, duplicates, stale edits, verified-email match, status-key tampering and active-prize lock passed.');
