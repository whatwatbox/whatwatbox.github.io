import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBoothUrl,safeImageUrl,parseProduct,computeCrop,buildPrefillUrl,validateGiftUrls,validateFields} from './prize-core.js';

test('product URLs are canonical and never forward gift codes or query strings',()=>{
  assert.equal(normalizeBoothUrl('https://shop.booth.pm/ja/items/123?tracking=secret#fragment'),'https://shop.booth.pm/items/123');
  for(const url of ['http://booth.pm/items/1','https://booth.pm.evil.com/items/1','https://evil.com@booth.pm/items/1','https://booth.pm:4430/items/1','https://booth.pm/gifts/secret','https://booth.pm/items/../gifts/secret','https://other.shop.booth.pm/items/1'])assert.throws(()=>normalizeBoothUrl(url));
});
test('images come from known BOOTH CDNs only',()=>{
  assert.ok(safeImageUrl('https://booth.pximg.net/example.jpg'));
  for(const url of ['javascript:alert(1)','data:image/svg+xml,evil','https://booth.pximg.net.evil.com/image.png','https://a@booth.pximg.net/image.png'])assert.equal(safeImageUrl(url),'');
});
test('product mapping keeps exact text and does not combine a price range',()=>{
  const p=parseProduct({name:'商品 <b>original</b>',price:'¥ 2,480',shop:{name:'ショップ'},images:[{original:'https://booth.pximg.net/x.jpg'},'https://evil.test/x']},'https://booth.pm/items/123');
  assert.equal(p.name,'商品 <b>original</b>');assert.equal(p.price,'2480');assert.equal(p.images.length,1);
  assert.equal(parseProduct({name:'商品',price:'¥ 100 〜 ¥ 200'},'https://booth.pm/items/123').price,'');
});
test('cropping never exposes blank edges at any slider extreme',()=>{
  for(const [iw,ih]of [[2000,1000],[500,2000],[512,350]])for(const [w,h]of [[512,350],[1280,720],[1080,1080]])for(const zoom of [1,2.5,4])for(const x of [-1,0,1])for(const y of [-1,0,1]){
    const crop=computeCrop(iw,ih,w,h,zoom,x,y);assert.ok(crop.x<=0&&crop.y<=0);assert.ok(crop.x+crop.width>=w-1e-9);assert.ok(crop.y+crop.height>=h-1e-9);
  }
  assert.throws(()=>computeCrop(0,1,512,350));
});
test('prefill encodes values and never includes gift credentials',()=>{
  const cfg={formUrl:'https://docs.google.com/forms/d/e/abc/viewform?tracking=1',entries:{productName:'entry.1',giftCode:'entry.2',description:'entry.3'}};
  const url=new URL(buildPrefillUrl(cfg,{productName:'A&B 日本語',giftCode:'DO-NOT-SEND',description:'改行\nあり'}));
  assert.equal(url.searchParams.get('entry.1'),'A&B 日本語');assert.equal(url.searchParams.get('entry.3'),'改行\nあり');assert.ok(!url.href.includes('DO-NOT-SEND'));assert.ok(!url.searchParams.has('tracking'));
  assert.throws(()=>buildPrefillUrl({formUrl:'https://docs.google.com.evil.test/forms/d/e/abc/viewform'},{}));
});
test('gift checks are local syntax/duplicate checks only',()=>{
  assert.deepEqual(validateGiftUrls('https://booth.pm/gifts/test-a\nhttps://booth.pm/gifts/test-b').errors,[]);
  assert.equal(validateGiftUrls('https://booth.pm/gifts/test-a\nhttps://booth.pm/gifts/test-a/').errors.length,1);
  assert.equal(validateGiftUrls('https://booth.pm/items/1').errors.length,1);
});
test('card text limits are checked before handing over',()=>{
  const v={awardName:'作品賞',productName:'商品',shopName:'店',providerName:'応募者',productUrl:'https://booth.pm/items/1',price:'0',clusterId:'sample_id',category:'ギミック',platform:'Unity'};
  assert.deepEqual(validateFields(v),[]);
  assert.ok(validateFields({...v,productName:'あ'.repeat(29)}).some(e=>e.key==='productName'));
  assert.ok(validateFields({...v,contact:'https://x.com/name'}).some(e=>e.key==='contact'));
});

test('card text boundary lengths and Unicode counts',()=>{
  for(const [key,limit] of Object.entries({awardName:20,productName:28,shopName:24,providerName:18})){
    assert.ok(!validateFields({[key]:'あ'.repeat(limit)}).some(e=>e.key===key));
    assert.ok(validateFields({[key]:'あ'.repeat(limit+1)}).some(e=>e.key===key));
    assert.ok(!validateFields({[key]:'🎁'.repeat(limit)}).some(e=>e.key===key));
  }
});

 test("cluster ID is optional except guest requests; nonempty IDs stay validated",()=>{const v={awardName:"賞",productName:"景品",shopName:"店",providerName:"名前",price:"0",category:"その他",platform:"その他"};assert.deepEqual(validateFields(v),[]);assert.ok(validateFields({...v,guestRequest:"希望します"}).some(e=>e.key==="clusterId"));assert.ok(validateFields({...v,clusterId:"@invalid"}).some(e=>e.key==="clusterId"));});

test('gift prefill supports single and ordered pack URLs without exposing image bytes',()=>{
 const cfg={formUrl:'https://docs.google.com/forms/d/e/abc/viewform',entries:{giftUrls:'entry.1702448493',thumbnailData:'entry.9'}};
 for(const gifts of ['https://booth.pm/gifts/test-a','https://booth.pm/gifts/test-a\nhttps://booth.pm/gifts/test-b']){
  const url=new URL(buildPrefillUrl(cfg,{giftUrls:gifts,thumbnailData:'DO-NOT-SEND-IMAGE'}));
  assert.equal(url.searchParams.get('entry.1702448493'),gifts);assert.ok(!url.href.includes('DO-NOT-SEND-IMAGE'));
 }
});
