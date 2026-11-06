export function layoutAward(ctx,value){
  const str=String(value||'賞の名前'),chars=Array.from(str);
  let size=36,lines=[str];
  const font=()=>{ctx.font=`400 ${size}px "Mochiy Pop One",sans-serif`;};
  font();
  if(ctx.measureText(str).width>450&&chars.length>1){
    let best=Infinity;
    for(let i=1;i<chars.length;i++){
      const pair=[chars.slice(0,i).join(''),chars.slice(i).join('')];
      const width=Math.max(...pair.map(line=>ctx.measureText(line).width));
      if(width<best){best=width;lines=pair;}
    }
  }
  while(size>12&&(Math.max(...lines.map(line=>ctx.measureText(line).width))>450||size*1.12*lines.length>66)){size-=.5;font();}
  return {lines,size,lineHeight:size*1.12};
}
export const CATEGORY_COLORS={
  'アバター':{color:'#6d46ab',bg:'#f2edfa',ink:'#302344'},
  '衣装':{color:'#a53d50',bg:'#fff0f2',ink:'#49222b'},
  'アクセサリー':{color:'#866000',bg:'#fff7df',ink:'#40310f'},
  'ギミック':{color:'#235f96',bg:'#edf5ff',ink:'#17334f'},
  '楽曲':{color:'#176e5e',bg:'#eaf8f2',ink:'#173c33'},
  'その他':{color:'#526273',bg:'#f0f3f7',ink:'#263442'}
};
export const PLATFORM_COLORS={VRM:'#4c52a8',Unity:'#34495e',VRoid:'#994a18',Xwear:'#843e86',VRC:'#226c93',cluster:'#923957','ギフト':'#526c1c','その他':'#526273'};
export function getCardTheme(category,platform){
  const c=CATEGORY_COLORS[category]||CATEGORY_COLORS['その他'];
  return {bg:c.bg,border:c.color,ink:c.ink,muted:c.ink,tag:c.color,tagInk:'#ffffff',tag2:PLATFORM_COLORS[platform]||PLATFORM_COLORS['その他'],tag2Ink:'#ffffff',chip:c.color,chipInk:'#ffffff',ornament:c.color+'18'};
}
export function renderPrizeCard(image,values){
  const t=getCardTheme(values.category,values.platform);
  const out=document.createElement('canvas');out.width=out.height=512;const c=out.getContext('2d');
  const round=(x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}};
  round(1,1,510,510,24,t.bg,t.border);
  c.save();c.beginPath();c.roundRect(2,2,508,508,23);c.clip();c.fillStyle=t.ornament;
  for(const [x,y,r]of [[497,13,57],[0,509,46]]){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}c.restore();
  function font(size,weight,family){c.font=`${weight} ${size}px "${family}",sans-serif`;}
  function text(value,fallback,y,size,max,color,weight=800,family='M PLUS Rounded 1c',twoLines=false){
    const str=String(value||fallback);font(size,weight,family);let lines=[str];
    if(twoLines&&c.measureText(str).width>max){
      const chars=Array.from(str),middle=Math.ceil(chars.length/2);lines=[chars.slice(0,middle).join(''),chars.slice(middle).join('')];
    }
    while(lines.some(line=>c.measureText(line).width>max)&&size>12){size-=.5;font(size,weight,family);}
    c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';
    lines.forEach((line,i)=>c.fillText(line,256,y+(i-(lines.length-1)/2)*size*1.08,max));
  }
  const award=layoutAward(c,values.awardName);
  font(award.size,400,'Mochiy Pop One');c.fillStyle=t.ink;c.textAlign='center';c.textBaseline='middle';
  award.lines.forEach((line,i)=>c.fillText(line,256,39+(i-(award.lines.length-1)/2)*award.lineHeight,450));
  const tags=[values.category||'カテゴリ',values.platform||'対応形式'];font(17,800,'M PLUS Rounded 1c');
  const widths=tags.map(s=>Math.min(224,c.measureText(s).width+28)),total=widths[0]+widths[1]+8;
  let x=(512-total)/2;tags.forEach((str,i)=>{round(x,85,widths[i],26,13,i?t.tag2:t.tag);font(17,800,'M PLUS Rounded 1c');c.fillStyle=i?t.tag2Ink:t.tagInk;c.textAlign='center';c.textBaseline='middle';c.fillText(str,x+widths[i]/2,98,widths[i]-18);x+=widths[i]+8;});
  c.save();c.beginPath();c.roundRect(20,118,472,266,12);c.clip();c.fillStyle='#fff';c.fillRect(20,118,472,266);c.drawImage(image,20,118,472,266);c.restore();
  text(values.productName,'景品名',413,29,466,t.ink,800,'M PLUS Rounded 1c',true);
  text(values.shopName,'ショップ名',452,18,460,t.muted,700);
  round(24,470,464,30,15,t.chip);text(values.providerName,'提供者名',485,22,436,t.chipInk,800);
  return out;
}
