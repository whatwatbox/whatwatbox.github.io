import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.value='';this.hidden=false;this.disabled=false;this.textContent='';}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(){}
  addEventListener(name,fn){this.events[name]=fn;}
  async input(value){this.value=value;await this.events.input?.();}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
globalThis.document={getElementById:get,createElement:tag=>new Element(tag)};
get('prize-kind').value='single';
const src=readFileSync(root+'pack-editor.js','utf8').replace("'./pack-core.js?v=20261104-debug3'",JSON.stringify(pathToFileURL(root+'pack-core.js').href));
const {createPackEditor}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const removed=[],added=[],products={a:{name:'A',url:'https://booth.pm/items/1',price:'600',images:['a']},b:{name:'B',url:'https://booth.pm/items/2',price:'500',images:['b']}};
const editor=createPackEditor({fetchGift:async url=>products[url.endsWith('a')?'a':'b'],addProductImage:async(...args)=>added.push(args),removeProductImage:key=>removed.push(key),onChange(){}});
get('prize-kind').value='pack';get('prize-kind').events.change();
const cards=()=>get('pack-items').children;
const url=c=>c.children[2].children[0],fetch=c=>c.children[2].children[1],price=c=>c.children[4].children[0],remove=c=>c.children[0].children[1];
await url(cards()[0]).input('https://booth.pm/gifts/a');await url(cards()[1]).input('https://booth.pm/gifts/b');
await fetch(cards()[0]).onclick();await fetch(cards()[1]).onclick();assert.equal(get('reference-price').value,'1100');assert.equal(get('reference-price').readOnly,true);assert.equal(editor.errors().length,0);
await price(cards()[0]).input('');assert.equal(get('reference-price').value,'');assert.ok(editor.errors().some(s=>s.includes('参考価格')));
await price(cards()[0]).input('-1');assert.equal(get('reference-price').value,'');assert.ok(editor.errors().some(s=>s.includes('参考価格')));
await price(cards()[0]).input('0');assert.equal(get('reference-price').value,'500');assert.equal(editor.errors().length,0);
await price(cards()[0]).input('600');const saved=editor.exportState();assert.equal(editor.giftUrls(),'https://booth.pm/gifts/a\nhttps://booth.pm/gifts/b');assert.ok(!JSON.stringify(saved).includes('/gifts/'));assert.deepEqual(saved.map(i=>i.id),[1,2]);
await remove(cards()[1]).onclick();assert.equal(get('reference-price').value,'600');assert.ok(removed.includes('pack:2'));
editor.restore(saved,['https://booth.pm/gifts/a','https://booth.pm/gifts/b']);assert.deepEqual(editor.exportState().map(i=>i.id),[1,2]);assert.equal(get('reference-price').value,'1100');
await url(cards()[0]).input('https://booth.pm/gifts/changed');assert.equal(price(cards()[0]).value,'');assert.equal(get('reference-price').value,'');assert.ok(removed.includes('pack:1'));
get('prize-kind').value='single';get('prize-kind').events.change();assert.equal(get('reference-price').readOnly,false);
console.log('Pack editor: sum, missing/negative/zero price, read-only total, deletion cleanup, URL changes, stable restored IDs and single-mode editability passed.');
