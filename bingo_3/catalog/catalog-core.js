export function filterPrizes(items,{query='',category='',platform='',kind=''}={}){
 const q=query.trim().normalize('NFKC').toLocaleLowerCase('ja');
 return items.filter(p=>(!category||p.category===category)&&(!platform||p.platform===platform)&&(!kind||p.kind===kind)&&(!q||[p.name,p.award,p.shop,p.provider,...(p.products||[]).map(x=>x.name)].join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(q)));
}
export function safeProductUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:[a-z0-9-]+\.)?booth\.pm$/.test(u.hostname)&&/^\/(?:[a-z]{2}\/)?items\/\d{1,12}$/.test(u.pathname)&&!u.search&&!u.hash?u.href:'';}catch{return '';}}

export function safeThumbnailUrl(raw){try{const u=new URL(raw);return u.origin==='https://watbox.net'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/bingo_3\/catalog\/media\/p-[a-f0-9]{20}-[a-f0-9]{20}\.jpg$/.test(u.pathname)?u.href:'';}catch{return '';}}
