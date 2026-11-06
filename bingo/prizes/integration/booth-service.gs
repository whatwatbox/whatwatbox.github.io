/** Public product metadata via GET. Private gift URLs accepted only in POST bodies. No Drive/Sheets scopes. */
function doGet(e) {
  var p=(e&&e.parameter)||{}, callback=String(p.callback||'');
  if(callback&&!/^bingoProduct_[A-Za-z0-9_]+$/.test(callback))return output_({ok:false,error:'Invalid callback'},'');
  var result;
  try{
    if(p.action!=='product'&&p.action!=='image')throw new Error('Unknown action');
    var url=normalizeProductUrl_(p.url), product=getProduct_(url);
    if(p.action==='product')result={ok:true,product:product};
    else if(p.action==='image'){
      var index=Number(p.index);
      if(!Number.isInteger(index)||index<0||index>=product.images.length)throw new Error('画像の指定が不正です。');
      var response=fetchAllowed_(product.images[index],'image'), mime=String(response.getHeaders()['Content-Type']||response.getHeaders()['content-type']||'').split(';')[0].toLowerCase();
      if(!/^image\/(png|jpeg|webp)$/.test(mime))throw new Error('この画像形式は対応していません。');
      var bytes=response.getBlob().getBytes();
      if(bytes.length>6*1024*1024)throw new Error('画像サイズが大きいため、ファイルから読み込んでください。');
      result={ok:true,dataUrl:'data:'+mime+';base64,'+Utilities.base64Encode(bytes)};
    }else throw new Error('Unknown action');
  }catch(error){result={ok:false,error:String(error.message||'商品情報の取得に失敗しました。').slice(0,300)};}
  return output_(result,callback);
}
function output_(value,callback){
  var json=JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return ContentService.createTextOutput(callback?callback+'('+json+');':json).setMimeType(callback?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);
}
function normalizeProductUrl_(value){
  var match=String(value||'').trim().match(/^https:\/\/((?:[a-z0-9-]+\.)?booth\.pm)\/(?:[a-z]{2}\/)?items\/(\d{1,12})(?:\.json)?\/?(?:[?#][^\s]*)?$/);
  if(!match)throw new Error('BOOTHの商品URLをご指定ください。');
  return 'https://'+match[1]+'/items/'+match[2];
}
function isAllowed_(url,kind){
  return kind==='product'?/^https:\/\/(?:[a-z0-9-]+\.)?booth\.pm\/(?:[a-z]{2}\/)?items\/\d+(?:\.json)?\/?$/.test(url):/^https:\/\/(?:booth\.pximg\.net|s\.booth\.pm)\/[A-Za-z0-9_./%?=&+-]+$/.test(url);
}
function fetchAllowed_(url,kind){
  for(var attempt=0;attempt<4;attempt++){
    if(!isAllowed_(url,kind))throw new Error('取得先を確認できませんでした。');
    var response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
    var code=response.getResponseCode();
    if([301,302,303,307,308].indexOf(code)!==-1){
      var headers=response.getHeaders(),next=String(headers.Location||headers.location||'');
      if(next.charAt(0)==='/'){var origin=url.match(/^https:\/\/[^/]+/)[0];next=origin+next;}
      url=next;continue;
    }
    if(code===403||code===429)throw new Error('BOOTH側で取得が制限されています。手動入力をご利用ください。');
    if(code!==200)throw new Error('商品が見つからないか、公開されていません。');
    return response;
  }
  throw new Error('転送先を確認できませんでした。');
}
function getProduct_(url){
  var cache=CacheService.getScriptCache(),key='booth:'+url,cached=cache.get(key);
  if(cached)return JSON.parse(cached);
  var raw=fetchAllowed_(url+'.json','product').getContentText('UTF-8');
  if(raw.length>1500000)throw new Error('商品情報が大きすぎるため取得できませんでした。');
  var data=JSON.parse(raw);
  if(!data.name)throw new Error('商品名を読み取れませんでした。');
  var images=(data.images||[]).map(function(image){return image.original||'';}).filter(function(image){return isAllowed_(image,'image');}).slice(0,12);
  var product={name:String(data.name).slice(0,250),url:url,shop:{name:String((data.shop||{}).name||'').slice(0,150)},description:String(data.description||'').slice(0,3000),price:String(data.price||''),images:images};
  var encoded=JSON.stringify(product);if(encoded.length<20000)cache.put(key,encoded,600);
  return product;
}

// Never use JSONP/GET for gift tokens. No token cache, logs, cookies or redemption requests.
function doPost(e){
  try{
    if(!e||e.contentLength>3000||e.parameter.action!=='gift')throw Error();
    var gift=String(e.parameter.giftUrl||'').trim();
    if(!/^https:\/\/booth\.pm\/gifts\/[A-Za-z0-9_-]{1,200}\/?$/.test(gift))throw Error();
    var response=UrlFetchApp.fetch(gift,{method:'get',followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true});
    if(response.getResponseCode()!==200)throw Error();
    var html=response.getContentText('UTF-8');if(html.length>1500000)throw Error();
    var productUrl=extractGiftProductUrl_(html);
    return output_({ok:true,product:getProduct_(productUrl)},'');
  }catch(error){return output_({ok:false,error:'ギフトの商品情報を取得できませんでした。商品情報を直接ご入力ください。'},'');}
}

// Use item hyperlinks, not gift tokens or arbitrary embedded URLs. Relative item
// links and escaped JSON slashes are supported; ambiguous pages fail closed.
function extractGiftProductUrl_(html){
  var text=String(html).replace(/\\\//g,'/').replace(/&amp;/g,'&');
  var links=[],match,re=/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  while((match=re.exec(text))!==null){
    var link=match[1];
    if(/^\/(?:[a-z]{2}\/)?items\//.test(link))link='https://booth.pm'+link;
    try{links.push(normalizeProductUrl_(link));}catch(ignore){}
  }
  if(!links.length)links=text.match(/https:\/\/(?:[a-z0-9-]+\.)?booth\.pm\/(?:[a-z]{2}\/)?items\/\d{1,12}(?!\d)/g)||[];
  var ids={};links.forEach(function(link){var u=normalizeProductUrl_(link),id=u.match(/items\/(\d+)/)[1];ids[id]=u;});
  var keys=Object.keys(ids);if(keys.length!==1)throw new Error('商品を特定できませんでした。');
  return ids[keys[0]];
}
