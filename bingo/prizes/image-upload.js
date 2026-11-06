// Only the rendered JPEG is sent to this endpoint. No gift URLs or personal fields.
export function createThumbnailUploader({endpoint,fetchImpl=fetch,timeoutMs=45000}){
  let lastData='',lastToken='',inflight=null,requestData='',requestId='';
  return async function upload(data){
    if(!endpoint)throw new Error('画像アップロード先が未設定です。運営側の接続設定をお待ちください。');
    const url=new URL(endpoint);
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname))throw new Error('画像アップロード先の設定をご確認ください。');
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length>40000)throw new Error('画像の形式・容量をご確認ください。');
    if(data===lastData&&lastToken)return lastToken;
    if(inflight){await inflight;return upload(data);}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    // Per-editor request ID: retries reuse it, different users never share a claim.
    if(requestData!==data){requestData=data;requestId=crypto.randomUUID();}
    inflight=(async()=>{
      const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({image:data,requestId}),credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      if(!response.ok)throw new Error('画像をアップロードできませんでした。時間をおいて再度お試しください。');
      const result=await response.json();
      if(!result.ok||!/^bingo-image:[a-f0-9-]{36}$/.test(result.imageId||''))throw new Error(result.code==='LIMIT'?'画像受付の上限に達しています。時間をおいて再度お試しください。':'画像を保存できませんでした。再度お試しください。');
      lastData=data;lastToken=result.imageId;return lastToken;
    })();
    try{return await inflight;}catch(error){if(error.name==='AbortError')throw new Error('画像の保存が時間内に完了しませんでした。再度お試しください。');throw error;}
    finally{clearTimeout(timer);inflight=null;}
  };
}
