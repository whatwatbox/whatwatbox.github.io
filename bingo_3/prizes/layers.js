export const LAYER_FONTS=['Mochiy Pop One', 'M PLUS Rounded 1c', 'M PLUS 2', 'Dela Gothic One'];
const layerFont=l=>LAYER_FONTS.includes(l.font)?l.font:"M PLUS Rounded 1c";
const layerWeight=l=>["Mochiy Pop One","Dela Gothic One"].includes(layerFont(l))?400:700;
// Image and text layers share selection, transforms, ordering and visibility.
export function createLayers(canvas,redraw){
  const $=id=>document.getElementById(id),ctx=canvas.getContext('2d'),layers=[];
  const selection=$('layer-selection');let selected=null,serial=0,gesture=null;
  const current=()=>layers.find(l=>l.id===selected);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function sizeOf(l){
    if(l.type==='image'){const w=canvas.width*l.size/100;return {w,h:w*l.image.naturalHeight/l.image.naturalWidth};}
    const font=l.size*canvas.width/512,lines=l.text.split('\n').slice(0,8);
    ctx.save();ctx.font=`${layerWeight(l)} ${font}px "${layerFont(l)}",sans-serif`;
    const w=Math.min(canvas.width*.95,Math.max(font,...lines.map(s=>ctx.measureText(s).width)));
    ctx.restore();return {w,h:font*1.2*Math.max(1,lines.length)};
  }
  function hit(l,p){
    if(!l.visible)return false;const a=-l.rotation*Math.PI/180,dx=p.x-canvas.width*l.x/100,dy=p.y-canvas.height*l.y/100;
    const x=dx*Math.cos(a)-dy*Math.sin(a),y=dx*Math.sin(a)+dy*Math.cos(a),s=sizeOf(l);
    return Math.abs(x)<=s.w/2&&Math.abs(y)<=s.h/2;
  }
  function renderList(){
    $('layer-list').replaceChildren();
    [...layers].reverse().forEach(l=>{
      const name=l.type==='text'?l.text.slice(0,18)||'文字':l.name;
      const row=document.createElement('div');row.className='layer-row';row.dataset.selected=String(l.id===selected);
      const visibility=document.createElement('button');visibility.type='button';visibility.className='layer-visibility';visibility.setAttribute('aria-label',name+'の表示');
      function updateEye(){
        const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
        const eye=document.createElementNS(ns,'path');eye.setAttribute('d','M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');
        const pupil=document.createElementNS(ns,'circle');pupil.setAttribute('cx','12');pupil.setAttribute('cy','12');pupil.setAttribute('r','3');svg.append(eye,pupil);
        if(!l.visible){const slash=document.createElementNS(ns,'path');slash.setAttribute('d','M3 3 21 21');svg.append(slash);}
        visibility.replaceChildren(svg);visibility.setAttribute('aria-pressed',String(l.visible));visibility.title=l.visible?'非表示にする':'表示する';
      }
      updateEye();visibility.onclick=()=>{l.visible=!l.visible;updateEye();props();redraw();};
      const b=document.createElement('button');b.type='button';b.className='layer-select';b.textContent=name;
      b.setAttribute('aria-pressed',String(l.id===selected));b.onclick=()=>select(l.id);row.append(visibility,b);$('layer-list').append(row);
    });
    if(!layers.length){const p=document.createElement('p');p.textContent='画像や文字を追加してください。';$('layer-list').append(p);}
  }
  function props(){
    const l=current();$('layer-properties').hidden=!l;if(!l)return;
    $('layer-text-field').hidden=l.type!=='text';$('layer-text').value=l.text||'';
    $('layer-color-field').hidden=l.type!=='text';$('layer-font-field').hidden=l.type!=='text';$('layer-stroke-field').hidden=l.type!=='text';$('layer-font').value=layerFont(l);$('layer-stroke').value=l.stroke||'#202020';
    $('layer-size').min=l.type==='text'?'8':'5';$('layer-size').max=l.type==='text'?'180':'500';
    for(const k of ['x','y','size','opacity','rotation'])$(`layer-${k}`).value=l[k];
    $('layer-color').value=l.color||'#ffffff';
    $('layer-active-name').textContent=l.type==='text'?'文字':l.name;
    $('fit-layer').disabled=l.type!=='image';$('fill-layer').disabled=l.type!=='image';
  }
  function outline(){
    const l=current();selection.hidden=!l||!l.visible;if(!l||!l.visible)return;
    const s=sizeOf(l),a=l.rotation*Math.PI/180,cx=canvas.width*l.x/100,cy=canvas.height*l.y/100;
    const ex=(Math.abs(s.w*Math.cos(a))+Math.abs(s.h*Math.sin(a)))/2,ey=(Math.abs(s.w*Math.sin(a))+Math.abs(s.h*Math.cos(a)))/2;
    // Keep handles reachable even when an image extends beyond the crop window.
    const left=clamp(cx-ex,4,canvas.width-4),top=clamp(cy-ey,4,canvas.height-4),right=clamp(cx+ex,4,canvas.width-4),bottom=clamp(cy+ey,4,canvas.height-4);
    if(right-left<2||bottom-top<2){selection.hidden=true;return;}
    Object.assign(selection.style,{left:`${left/canvas.width*100}%`,top:`${top/canvas.height*100}%`,width:`${(right-left)/canvas.width*100}%`,height:`${(bottom-top)/canvas.height*100}%`});
  }
  function select(id){selected=id;renderList();props();outline();}
  function changed(){props();redraw();}
  function fit(l,cover){
    const scale=(cover?Math.max:Math.min)(canvas.width/l.image.naturalWidth,canvas.height/l.image.naturalHeight);
    l.size=l.image.naturalWidth*scale/canvas.width*100;l.x=l.y=50;l.rotation=0;
  }
  function add(l){
    if(layers.length>=12){$('layer-status').textContent='レイヤーは12個まで追加できます。';return null;}
    Object.assign(l,{id:++serial,x:50,y:50,opacity:100,rotation:0,visible:true});layers.push(l);select(l.id);return l;
  }
  function addImage(image,name,key,transform){
    const existing=key&&layers.find(l=>l.productKey===key);
    if(existing){if(transform)Object.assign(existing,transform);layers.splice(layers.indexOf(existing),1);layers.push(existing);select(existing.id);redraw();return;}
    const l=add({type:'image',image,name:name||'画像',size:100,productKey:key||null});
    if(l){fit(l,!!key);if(transform)Object.assign(l,transform);changed();}
  }
  $('add-text').onclick=()=>{const l=add({type:'text',text:'景品名',size:36,color:'#ffffff',stroke:'#202020',font:'M PLUS Rounded 1c'});if(l)changed();};
  $('layer-image').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>20*1024*1024){$('layer-status').textContent='20MB以下のPNG・JPEG・WebPをご利用ください。';return;}
    const url=URL.createObjectURL(f);
    try{const image=new Image();image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>40000000)throw Error();addImage(image,f.name);}
    catch{$('layer-status').textContent='画像を読み込めませんでした。4000万画素以下の画像をご利用ください。';}
    finally{URL.revokeObjectURL(url);e.target.value='';}
  };
  for(const k of ['x','y','size','opacity','rotation','text','color','stroke','font'])$(`layer-${k}`).addEventListener('input',()=>{
    const l=current();if(!l)return;l[k]=['text','color','stroke','font'].includes(k)?$(`layer-${k}`).value:Number($(`layer-${k}`).value);
    renderList();redraw();if(k==='font')document.fonts.load(`${layerWeight(l)} 36px "${layerFont(l)}"`).then(()=>{if(layers.includes(l))redraw();}).catch(()=>{});
  });
  function remove(){const i=layers.findIndex(l=>l.id===selected);if(i<0)return;layers.splice(i,1);selected=layers[Math.min(i,layers.length-1)]?.id||null;renderList();changed();}
  $('delete-layer').onclick=remove;
  for(const [id,delta]of [['layer-forward',1],['layer-backward',-1]])$(id).onclick=()=>{
    const i=layers.findIndex(l=>l.id===selected),j=i+delta;if(i<0||j<0||j>=layers.length)return;
    [layers[i],layers[j]]=[layers[j],layers[i]];renderList();redraw();
  };
  for(const [id,cover]of [['fit-layer',false],['fill-layer',true]])$(id).onclick=()=>{const l=current();if(l?.type==='image'){fit(l,cover);changed();}};
  function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
  function begin(e,resize=false){
    if(e.button!==0)return;const p=point(e);
    if(!resize){const l=[...layers].reverse().find(l=>hit(l,p));select(l?.id||null);}
    const l=current();if(!l)return;
    const cx=canvas.width*l.x/100,cy=canvas.height*l.y/100;
    gesture={id:l.id,mode:resize?'resize':'move',start:p,x:l.x,y:l.y,size:l.size,distance:Math.max(1,Math.hypot(p.x-cx,p.y-cy)),cx,cy};
    e.preventDefault();e.stopPropagation();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerdown',e=>begin(e));
  selection.querySelectorAll('[data-resize]').forEach(b=>b.addEventListener('pointerdown',e=>begin(e,true)));
  canvas.addEventListener('pointermove',e=>{
    if(!gesture)return;const l=layers.find(l=>l.id===gesture.id);if(!l)return;const p=point(e);
    if(gesture.mode==='move'){l.x=clamp(gesture.x+(p.x-gesture.start.x)/canvas.width*100,-100,200);l.y=clamp(gesture.y+(p.y-gesture.start.y)/canvas.height*100,-100,200);}
    else l.size=clamp(gesture.size*Math.hypot(p.x-gesture.cx,p.y-gesture.cy)/gesture.distance,l.type==='text'?8:5,l.type==='text'?180:500);
    changed();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>gesture=null);
  canvas.addEventListener('keydown',e=>{
    const l=current();if(!l)return;const step=e.shiftKey?10:1;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},d=directions[e.key];if(!d)return;
    e.preventDefault();l.x=clamp(l.x+d[0]*step/canvas.width*100,-100,200);l.y=clamp(l.y+d[1]*step/canvas.height*100,-100,200);changed();
  });
  renderList();
  return {addImage,removeProductImage(key){
    for(let i=layers.length-1;i>=0;i--)if(layers[i].productKey===key)layers.splice(i,1);
    if(!current())selected=null;renderList();changed();
  },arrangeProductImage(key,index,count){
    const l=layers.find(l=>l.type==='image'&&l.productKey===key);if(!l)return false;
    const cols=count>4?3:2,rows=Math.ceil(count/cols),cw=canvas.width/cols-12,ch=canvas.height/rows-12;
    l.size=l.image.naturalWidth*Math.min(cw/l.image.naturalWidth,ch/l.image.naturalHeight)/canvas.width*100;
    l.x=(index%cols+.5)*100/cols;l.y=(Math.floor(index/cols)+.5)*100/rows;l.rotation=0;
    select(l.id);changed();return true;
  },exportState(){
    return layers.map(l=>{const result={productKey:l.productKey||null,type:l.type,name:l.name||'',text:l.text||'',color:l.color||'#ffffff',stroke:l.stroke||'#202020',font:layerFont(l),visible:l.visible,x:l.x,y:l.y,size:l.size,opacity:l.opacity,rotation:l.rotation};
      if(l.type==='image'){const out=document.createElement('canvas'),scale=Math.min(1,768/l.image.naturalWidth,768/l.image.naturalHeight);out.width=Math.max(1,Math.round(l.image.naturalWidth*scale));out.height=Math.max(1,Math.round(l.image.naturalHeight*scale));out.getContext('2d').drawImage(l.image,0,0,out.width,out.height);result.imageData=out.toDataURL('image/webp',.8);}
      return result;});
  },async restoreState(saved){
    if(!Array.isArray(saved)||saved.length>12)throw Error('レイヤーデータを読み込めません。');
    const restored=await Promise.all(saved.map(async l=>{const next={...l,font:layerFont(l),stroke:/^#[a-f0-9]{6}$/i.test(l.stroke||'')?l.stroke:'#202020'};await document.fonts.load(`${layerWeight(next)} 36px "${layerFont(next)}"`);if(l.type==='image'){if(!/^data:image\/(?:png|jpeg|webp);base64,/.test(l.imageData||''))throw Error('画像データを読み込めません。');const image=new Image();image.src=l.imageData;await image.decode();if(image.naturalWidth>2048||image.naturalHeight>2048)throw Error('復元画像が大きすぎます。');next.image=image;delete next.imageData;}next.id=++serial;return next;}));
    layers.splice(0,layers.length,...restored);selected=layers[layers.length-1]?.id||null;renderList();changed();
  },hasContent:()=>layers.some(l=>l.visible),clearProductImages(){
    for(let i=layers.length-1;i>=0;i--)if(layers[i].productKey)layers.splice(i,1);
    if(!current())selected=null;renderList();props();
  },draw(){
    for(const l of layers){if(!l.visible)continue;ctx.save();ctx.globalAlpha=l.opacity/100;
      ctx.translate(canvas.width*l.x/100,canvas.height*l.y/100);ctx.rotate(l.rotation*Math.PI/180);
      const s=sizeOf(l);
      if(l.type==='image')ctx.drawImage(l.image,-s.w/2,-s.h/2,s.w,s.h);
      else{const font=l.size*canvas.width/512,lines=l.text.split('\n').slice(0,8);ctx.font=`${layerWeight(l)} ${font}px "${layerFont(l)}",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=Math.max(2,font*.1);ctx.strokeStyle=l.stroke||'#202020';ctx.fillStyle=l.color;lines.forEach((line,i)=>{const y=(i-(lines.length-1)/2)*font*1.2;ctx.strokeText(line,0,y,canvas.width*.95);ctx.fillText(line,0,y,canvas.width*.95);});}
      ctx.restore();
    }outline();
  }};
}
