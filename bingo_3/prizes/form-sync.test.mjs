import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildPrefillUrl,validateGiftUrls} from './prize-core.js';
const source=fs.readFileSync(new URL('./prize-app.js',import.meta.url),'utf8');
const flow=source.slice(source.indexOf('function setFormBlocked('),source.indexOf("$('open-google-form').addEventListener"));
class Element{
 constructor(){this.value='';this.attributes={};this.events={};this.hidden=true;this.disabled=false;this.classList={toggle(){}};}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
 addEventListener(k,f){this.events[k]=f;}removeEventListener(k){delete this.events[k];}
 set src(v){this.attributes.src=v;}get src(){return this.attributes.src;}
 scrollIntoView(){}focus(){}
}
const elements={},get=id=>elements[id]??=new Element();
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
let upload=deferred(),prepare=deferred(),timeoutCallback,locked=false;
const context=vm.createContext({URL,Error,Promise,clearTimeout:()=>{timeoutCallback=null;},setTimeout:fn=>{timeoutCallback=fn;return 1;},buildPrefillUrl,validateGiftUrls,document:{fonts:{ready:Promise.resolve()}},$:get,
 config:{formUrl:'https://docs.google.com/forms/d/e/abc/viewform',entries:{giftUrls:'entry.1702448493',internalData:'entry.1',editId:'entry.2'}},
 lifecycle:{isLocked:()=>locked,prepare:()=>prepare.promise},uploadThumbnail:()=>upload.promise,
 editorSnapshot:()=>({kind:'single',values:{},items:[]}),encodeThumbnail:()=> 'data:image/jpeg;base64,/9j/2Q==',
 status(){},syncVersion:0,syncTimer:null,latestImageData:''});
vm.runInContext(flow,context);
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
get('booth-gift-url').value='https://booth.pm/gifts/test-a';
let work=vm.runInContext('syncForm()',context);
assert.equal(get('google-form-frame').inert,true);assert.equal(get('open-google-form').disabled,true);
await tick();assert.equal(get('google-form-frame').src,undefined);
upload.resolve('bingo-image:dummy');await tick();assert.equal(get('google-form-frame').inert,true);
prepare.resolve({internalData:'internal',editId:'test-edit'});await tick();
assert.equal(new URL(get('google-form-frame').src).searchParams.get('entry.1702448493'),'https://booth.pm/gifts/test-a');
assert.equal(get('google-form-frame').inert,true);get('google-form-frame').events.load();await work;
assert.equal(get('google-form-frame').inert,false);assert.equal(get('form-upload-overlay').hidden,true);assert.equal(get('open-google-form').disabled,false);
// Failure leaves the old form blocked, but the retry control is available.
upload=deferred();prepare=deferred();work=vm.runInContext('syncForm()',context);await tick();upload.reject(Error('upload failed'));await work;
assert.equal(get('google-form-frame').inert,true);assert.equal(get('form-external').inert,true);assert.equal(get('open-google-form').disabled,false);
// Retry succeeds and unblocks even when the prepared form URL is unchanged.
upload=deferred();prepare=deferred();work=vm.runInContext('syncForm()',context);await tick();upload.resolve('image');await tick();prepare.resolve({internalData:'internal',editId:'test-edit'});await work;
assert.equal(get('google-form-frame').inert,false);
console.log('Gift form sync: upload/preparation/load gating, errors and successful retry passed.');

// A timed-out URL must load successfully on retry; matching src alone is insufficient.
upload=deferred();prepare=deferred();work=vm.runInContext('syncForm()',context);await tick();upload.resolve('image');await tick();prepare.resolve({internalData:'new-internal',editId:'test-edit'});await tick();timeoutCallback();await work;
assert.equal(get('google-form-frame').inert,true);
upload=deferred();prepare=deferred();work=vm.runInContext('syncForm()',context);await tick();upload.resolve('image');await tick();prepare.resolve({internalData:'new-internal',editId:'test-edit'});await tick();assert.equal(get('google-form-frame').inert,true);get('google-form-frame').events.load();await work;assert.equal(get('google-form-frame').inert,false);
// Submission confirmation during upload must never re-enable a locked editor.
upload=deferred();prepare=deferred();work=vm.runInContext('syncForm()',context);await tick();locked=true;upload.resolve('image');await work;assert.equal(get('google-form-frame').inert,true);assert.equal(get('open-google-form').disabled,true);assert.equal(get('auto-sync').disabled,true);
console.log('Timeout retry and submission-confirmation race checks passed.');
