/** Bind to the response spreadsheet. Set a dedicated PRIVATE folder ID first.
 * Install a spreadsheet "On form submit" trigger for onPrizeFormSubmit.
 * No public web deployment is needed. Does not read or log gift URLs.
 */
var PRIZE_IMAGE_FOLDER_ID = '';
var PRIZE_IMAGE_COLUMN = 'サムネ画像データ';
var PRIZE_IMAGE_URL_COLUMN = 'サムネ画像ファイル';
var PRIZE_IMAGE_STATUS_COLUMN = '画像変換結果';

function onPrizeFormSubmit(e) {
  if(!e||!e.range)throw new Error('回答スプレッドシートのフォーム送信トリガーから実行してください。');
  if(!PRIZE_IMAGE_FOLDER_ID)throw new Error('非公開の画像保存先フォルダを設定してください。');
  var lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    var sheet=e.range.getSheet(),row=e.range.getRow();
    var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var input=headers.indexOf(PRIZE_IMAGE_COLUMN)+1;
    if(!input)throw new Error('サムネ画像データ列が見つかりません。');
    var output=ensurePrizeColumn_(sheet,headers,PRIZE_IMAGE_URL_COLUMN);
    var state=ensurePrizeColumn_(sheet,headers,PRIZE_IMAGE_STATUS_COLUMN);
    if(sheet.getRange(row,output).getValue())return;
    var value=String(sheet.getRange(row,input).getValue()||'');
    try {
      var bytes=decodePrizeJpeg_(value);
      var folder=DriveApp.getFolderById(PRIZE_IMAGE_FOLDER_ID);
      // UUID only: untrusted form values never become file names or formulas.
      var name='bingo-prize-'+Utilities.getUuid()+'.jpg';
      var file=folder.createFile(Utilities.newBlob(bytes,'image/jpeg',name));
      // No setSharing call: files inherit the dedicated private folder's access.
      sheet.getRange(row,output).setValue(file.getUrl());
      sheet.getRange(row,state).setValue('変換済み');
    }catch(error){sheet.getRange(row,state).setValue('変換エラー：画像データの形式・容量・保存先をご確認ください。');}
  }finally{lock.releaseLock();}
}
function ensurePrizeColumn_(sheet,headers,title){
  var col=headers.indexOf(title)+1;if(col)return col;
  headers.push(title);col=headers.length;sheet.getRange(1,col).setValue(title);return col;
}
function decodePrizeJpeg_(value){
  if(value.length>40000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new Error('Invalid image');
  var bytes=Utilities.base64Decode(value.slice(value.indexOf(',')+1));
  var u=bytes.map(function(b){return b&255;});
  if(u.length<12||u[0]!==255||u[1]!==216||u[u.length-2]!==255||u[u.length-1]!==217)throw new Error('Invalid JPEG');
  var i=2,found=false;
  while(i<u.length-4){
    if(u[i++]!==255)throw new Error('Invalid marker');
    while(u[i]===255)i++;
    var marker=u[i++];if(marker===218||marker===217)break;
    if(marker===1||(marker>=208&&marker<=215))continue;
    var len=(u[i]<<8)|u[i+1];if(len<2||i+len>u.length)throw new Error('Invalid length');
    if([192,193,194].indexOf(marker)!==-1){
      if(len<8)throw new Error('Invalid frame');
      var height=(u[i+3]<<8)|u[i+4],width=(u[i+5]<<8)|u[i+6];
      if(width!==512||[350,512].indexOf(height)===-1)throw new Error('Invalid dimensions');found=true;break;
    }i+=len;
  }
  if(!found)throw new Error('Missing frame');return bytes;
}
