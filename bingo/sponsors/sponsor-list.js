// Confirmed sponsors only. Keep the empty-state message until entries are supplied.
const grid=document.querySelector('#sponsor-list');
if(grid)fetch('./sponsors/sponsors.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 const safeUrl=value=>{try{const u=new URL(value,location.href);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
 for(const entry of data.sponsors||[]){if(!entry.name)continue;const url=entry.url&&safeUrl(entry.url);const card=document.createElement(url?'a':'div');card.className='supporter-entry';if(url){card.href=url;card.target='_blank';card.rel='noopener noreferrer';}const logo=entry.logo&&safeUrl(entry.logo);if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';card.append(img);}const name=document.createElement('span');name.textContent=entry.name;card.append(name);grid.append(card);}
 if(grid.children.length){grid.hidden=false;document.querySelector('#sponsor-empty').hidden=true;}
}).catch(()=>{});
