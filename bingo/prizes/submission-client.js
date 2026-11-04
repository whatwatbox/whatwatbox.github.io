const KEY='bingo-submission-status-v1';
export async function submissionRequest(endpoint,body){
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname))throw Error('投稿サービスの設定をご確認ください。');
  const response=await fetch(url.href,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(body),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('投稿状況を確認できませんでした。再度お試しください。');
  const result=await response.json();if(!result.ok){const errors={LOCKED:'運営が景品を公開済みです。修正はW@へご連絡ください。',STALE:'新しい投稿があるため、修正用IDから読み込み直してください。',LIMIT:'保存回数の上限に達しました。時間をおいてお試しください。',SIZE:'編集データが大きすぎます。画像レイヤーを減らしてください。',NOT_FOUND:'データが見つからないか、投稿サービスを利用できません。IDと接続状況をご確認ください。'};throw Error(errors[result.code]||'処理できませんでした。再度お試しください。');}return result;
}
export function readSubmission(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
export function rememberSubmission(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{}}
export function forgetSubmission(){try{sessionStorage.removeItem(KEY);}catch{}}
export function createSubmissionLifecycle({endpoint,getSnapshot,restoreSnapshot,onRestored,onLock}){
  const $=id=>document.getElementById(id);let current=null,editId='',revision=0,timer,busy=false,locked=false,confirmed=false;
  const note=text=>{$('submission-reminder-text').textContent=text;};
  function lock(){locked=true;onLock();document.querySelectorAll('#product-step input,#product-step select,#product-step button,#provider-step input,#image-step input,#image-step textarea,#image-step button,#submit-step button,#auto-sync').forEach(e=>e.disabled=true);}
  async function check(){
    if(!current||busy||confirmed)return;busy=true;
    try{const result=await submissionRequest(endpoint(),{action:'submissionStatus',statusToken:current.statusToken});
      if(result.state==='submitted'){confirmed=true;lock();rememberSubmission({...current,submitted:true});location.replace(new URL('./complete/',location.href));return;}
      if(result.state==='rejected'){clearTimeout(timer);note(result.message||'送信内容に確認が必要です。フォームの案内をご確認ください。');return;}
    }catch{note('投稿完了をまだ確認できていません。フォーム送信後は、この画面でお待ちください。');}
    finally{busy=false;}
    clearTimeout(timer);if(!document.hidden)timer=setTimeout(check,20000);
  }
  async function prepare(imageId,packData,options={}){
    if(locked)throw Error('投稿済みのため編集できません。修正用IDから読み込み直してください。');
    const snapshot=options.snapshot||await getSnapshot();note('編集内容を保存しています。まだ投稿は完了していません。');
    const result=await submissionRequest(endpoint(),{action:'saveSubmissionDraft',snapshot,editId,revision});
    if(options.isCurrent&&!options.isCurrent()){note('まだ投稿されていません。下のGoogleフォームで送信してください。');throw Error('反映を中止しました。');}
    editId=result.editId;revision=result.revision;
    current={statusToken:result.statusToken,started:Date.now(),submitted:false};rememberSubmission(current);
    note('まだ投稿されていません。下のGoogleフォームで送信してください。');check();
    return {internalData:JSON.stringify({v:2,draftId:result.draftId,revision:result.revision,editId:result.editId,imageId,packData:packData||''}),editId:result.editId};
  }
  async function restore(){
    const id=$('restore-edit-id').value.trim();if(!/^B3E-[a-f0-9]{32}-[a-f0-9]{32}$/.test(id)){ $('restore-status').textContent='確認メールの修正用IDをすべて貼り付けてください。';return;}
    $('restore-submit').disabled=true;
    try{const result=await submissionRequest(endpoint(),{action:'restoreSubmission',editId:id});clearTimeout(timer);await restoreSnapshot(result.snapshot,result.gifts);editId=id;revision=result.revision;current=null;forgetSubmission();onRestored();$('restore-status').textContent='投稿内容を復元しました。修正後、フォームへ反映して再投稿してください。';note('修正内容はまだ投稿されていません。フォームで再投稿すると元の投稿を差し替えます。');}
    catch(error){$('restore-status').textContent=error.message;}finally{$('restore-submit').disabled=false;}
  }
  $('restore-submit').onclick=restore;
  $('submission-jump').onclick=()=>{$('submit-step').scrollIntoView({behavior:'smooth',block:'start'});};
  $('google-form-frame').addEventListener('load',()=>{if(current)check();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current)check();});
  window.addEventListener('pageshow',()=>{if(current)check();});
  function resume(){const saved=readSubmission();if(saved?.statusToken){current=saved;if(saved.submitted)lock();check();}}
  return {prepare,resume,isLocked:()=>locked};
}
