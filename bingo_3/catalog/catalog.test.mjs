import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import {filterPrizes,safeProductUrl,safeThumbnailUrl} from './catalog-core.js';
const headers=['投稿状態','一覧公開','景品名','内部情報','賞の名前','景品元名','応募者名','タグ1','タグ2','商品URL(任意)','メールアドレス','ギフトURL','修正用ID','受取コード'];
const valid=['有効','','景品A','{}','A賞','お店','提供者','ギミック','Unity','https://shop.booth.pm/items/1','secret@example.com','https://booth.pm/gifts/secret','B3E-secret','B3-secret'];
const rows=[headers,valid,['差替済み',...valid.slice(1)],['有効','非公開',...valid.slice(2)],['要確認',...valid.slice(1)],['有効','','booth.pm/gifts/leak',...valid.slice(3)],['有効','','パック',JSON.stringify({packData:'pack'}),...valid.slice(4)]];
const c={Date,JSON,Array,String,Error,imageHash_:s=>crypto.createHash('sha256').update(s).digest('hex'),receiptProduct_:s=>{const u=safeProductUrl(s);if(!u)throw Error();return u;},receiptPack_:()=>[{name:'同梱商品',shop:'店',url:'https://shop.booth.pm/items/2'}]};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('./catalog-service.gs',import.meta.url),'utf8'),c);
const data=c.catalogBuild_({getDataRange:()=>({getValues:()=>rows}),getSheetId:()=>123},()=>{throw Error('missing');},0);
assert.equal(data.items.length,2);assert.equal(data.items[0].kind,'pack');assert.equal(data.items[1].thumbnail,'');
assert.equal(data.items[1].id.length,22);for(const secret of ['secret@example.com','/gifts/','B3E-','受取コード','内部情報'])assert.ok(!JSON.stringify(data).includes(secret));
assert.equal(filterPrizes(data.items,{category:'ギミック',platform:'Unity',kind:'pack',query:'同梱'}).length,1);assert.equal(filterPrizes(data.items,{query:'景品a'}).length,1);assert.equal(filterPrizes(data.items,{platform:'VRM'}).length,0);
assert.equal(safeProductUrl('https://booth.pm/gifts/secret'),'');assert.equal(safeProductUrl('javascript:alert(1)'),'');assert.equal(safeProductUrl('https://evil.test/items/1'),'');assert.equal(safeProductUrl('https://shop.booth.pm/items/1?gift=x'),'');
assert.throws(()=>c.catalogSafeText_('B3E-abcdef',100));assert.throws(()=>c.catalogSafeText_('B3-11111111-22222222-33333333-44444444',160));assert.throws(()=>c.catalogBuild_({getDataRange:()=>({getValues:()=>[headers,...Array(1001).fill(valid)]})},()=>'',0));
console.log('Catalog sanitization, publication states, missing images, pack filtering, safe links and limits passed.');

assert.equal(c.CATALOG_TTL_MS,60000);assert.equal(data.refreshSeconds,60);

// Exercise the public cache path: a fresh snapshot is reused, an expired one
// rebuilds once, and a non-private response sheet never serves cached data.
let content=JSON.stringify({ok:true,v:1,items:[],updatedAt:new Date().toISOString()}),updated=Date.now(),builds=0,privateSheet=true;
const file={getLastUpdated:()=>new Date(updated),getBlob:()=>({getDataAsString:()=>content}),setContent:value=>{content=value;updated=Date.now();}};
c.receiptBook_=()=>{if(!privateSheet)throw Error('restricted');return {};};c.catalogFile_=()=>file;c.imageJson_=x=>x;c.catalogSource_=()=>({});c.catalogBuild_=()=>{builds++;return {ok:true,v:1,items:[],refreshSeconds:60};};c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
assert.equal(c.catalogResponse_().ok,true);assert.equal(builds,0);
updated=Date.now()-60001;assert.equal(c.catalogResponse_().ok,true);assert.equal(builds,1);assert.equal(c.catalogResponse_().ok,true);assert.equal(builds,1);
privateSheet=false;assert.equal(c.catalogResponse_().code,'UNAVAILABLE');assert.equal(builds,1);

const thumb='data:image/jpeg;base64,/9j/2Q==';
c.catalogResponse_=()=>({getContent:()=>JSON.stringify({ok:true,v:1,items:[{id:'p-'+'a'.repeat(20),thumbnail:thumb}]})});
const info=c.catalogInfoResponse_();assert.equal(info.items[0].thumbnail,undefined);assert.equal(info.items[0].thumbnailUrl,'https://watbox.net/bingo_3/catalog/media/p-'+ 'a'.repeat(20)+'-'+crypto.createHash('sha256').update(thumb).digest('hex').slice(0,20)+'.jpg');
assert.equal(safeThumbnailUrl(info.items[0].thumbnailUrl),info.items[0].thumbnailUrl);for(const url of ['https://evil.test/a.jpg','data:image/jpeg;base64,AAAA','https://watbox.net/bingo_3/catalog/media/../secret'])assert.equal(safeThumbnailUrl(url),'');

// A claimed image remains bound to the same submission after a row move.
let imageMeta={kind:'bingo-thumbnail',state:'claimed',row:'123:13',draftId:'a'.repeat(32)},reads=0;
c.imageFolder_=()=>({});c.imageFile_=()=>({getDescription:()=>JSON.stringify(imageMeta),getBlob:()=>({getBytes:()=>{reads++;return [255,216,255,217];}})});c.Utilities={base64Encode:()=>'/9j/2Q=='};
const imageId='bingo-image:11111111-2222-3333-4444-555555555555';
assert.ok(c.catalogThumbnail_(imageId,'123:2','a'.repeat(32)));assert.equal(c.catalogThumbnail_(imageId,'123:2','b'.repeat(32)),'');assert.equal(c.catalogThumbnail_(imageId,'123:2'),'');assert.equal(reads,1);
imageMeta.state='pending';assert.equal(c.catalogThumbnail_(imageId,'123:2','a'.repeat(32)),'');assert.equal(reads,1);
console.log('Stable submission image bindings survive row moves and reject other submissions or unclaimed images.');
