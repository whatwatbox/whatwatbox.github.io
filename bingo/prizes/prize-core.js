export const CARD_TEXT_LIMITS = Object.freeze({awardName:20,productName:28,shopName:24,providerName:18});
export function normalizeBoothUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('BOOTHの商品URLを入力してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^(?:[a-z0-9-]+\.)?booth\.pm$/.test(url.hostname)) {
    throw new Error('https:// で始まるBOOTHの商品URLを入力してください。');
  }
  const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?items\/(\d{1,12})(?:\.json)?\/?$/);
  if (!match) throw new Error('ギフトURLではなく、/items/ を含む商品ページのURLを入力してください。');
  return `https://${url.hostname}/items/${match[1]}`;
}

export function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['booth.pximg.net', 's.booth.pm'].includes(url.hostname) ? url.href : '';
  } catch { return ''; }
}

export function parseProduct(data, fallbackUrl) {
  if (!data || typeof data !== 'object') throw new Error('商品データの形式を確認してください。');
  const name = String(data.name || data.title || '').trim().slice(0, 250);
  if (!name) throw new Error('商品名を読み取れませんでした。商品ページのデータをご確認ください。');
  const url = normalizeBoothUrl(data.url || fallbackUrl);
  return {
    name, url,
    shop: String((typeof data.shop === 'string' ? data.shop : data.shop?.name) || data.shopName || '').slice(0, 150),
    description: String(data.description || '').slice(0, 3000),
    price: (() => { const numbers=String(data.price||'').match(/\d[\d,]*/g)||[];return numbers.length===1?numbers[0].replace(/,/g,'').slice(0,9):''; })(),
    images: (Array.isArray(data.images) ? data.images : []).map(image => safeImageUrl(typeof image === 'string' ? image : image.original || image.url)).filter(Boolean).slice(0, 12)
  };
}

export function computeCrop(iw, ih, width, height, zoom = 1, x = 0, y = 0) {
  if (![iw, ih, width, height, zoom, x, y].every(Number.isFinite) || Math.min(iw, ih, width, height) <= 0) throw new Error('画像サイズが不正です。');
  const scale = Math.max(width / iw, height / ih) * Math.max(1, Math.min(4, zoom));
  const dw = iw * scale, dh = ih * scale;
  const excessX = Math.max(0, dw - width), excessY = Math.max(0, dh - height);
  return {width: dw, height: dh, x: -excessX / 2 + Math.max(-1, Math.min(1, x)) * excessX / 2, y: -excessY / 2 + Math.max(-1, Math.min(1, y)) * excessY / 2};
}

export function buildPrefillUrl(config, values) {
  const raw = config.prefillTemplateUrl || config.formUrl;
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new Error('投稿フォームの設定を確認してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== 'docs.google.com' || !/^\/forms\/d\/(?:e\/)?[\w-]+\/viewform\/?$/.test(url.pathname)) {
    throw new Error('投稿フォームのURLはGoogleフォームの回答用URLを設定してください。');
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set('usp', 'pp_url');
  // Deliberately excludes gift codes and image contents from URL parameters.
  const allowed = ['productName', 'productUrl', 'shopName', 'providerName', 'description', 'guestRequest', 'contact', 'awardName', 'price', 'category', 'platform', 'clusterId'];
  for (const key of allowed) {
    const entry = config.entries?.[key];
    const value = String(values[key] || '').trim();
    if (/^entry\.\d+$/.test(entry || '') && value) url.searchParams.set(entry, value);
  }
  return url.href;
}

export function createSummary(values) {
  return [['賞の名前',values.awardName], ['景品名',values.productName], ['商品URL',values.productUrl], ['ショップ名',values.shopName], ['提供者名',values.providerName], ['clusterユーザーID',values.clusterId], ['Xアカウント',values.contact], ['カテゴリ',values.category], ['対応形式',values.platform], ['参考価格',values.price], ['ゲスト枠希望',values.guestRequest], ['紹介文・補足',values.description]]
    .filter(([,value]) => String(value || '').trim()).map(([label,value]) => `${label}：${String(value).trim()}`).join('\n');
}

export function validateGiftUrls(text) {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const seen = new Set(), errors = [];
  lines.forEach((line, index) => {
    let url;
    try { url = new URL(line); } catch { errors.push(`${index + 1}行目：ギフトURLの形式をご確認ください。`); return; }
    if (url.protocol !== 'https:' || url.hostname !== 'booth.pm' || url.username || url.password || url.port || !/^\/gifts\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) || url.search || url.hash) {
      errors.push(`${index + 1}行目：BOOTHのギフトURLをご入力ください。`); return;
    }
    const key = url.pathname.replace(/\/$/, '');
    if (seen.has(key)) errors.push(`${index + 1}行目：同じギフトURLが重複しています。`);
    seen.add(key);
  });
  return {count:lines.length, errors};
}

export function validateFields(values) {
  const errors = [];
  for (const [key, label, limit] of [['awardName','賞の名前'],['productName','景品名'],['shopName','ショップ名'],['providerName','提供者名']]) {
    const limit = CARD_TEXT_LIMITS[key];
    const text = String(values[key] || '').trim();
    if (!text) errors.push({key, message:`${label}をご入力ください。`});
    else if (Array.from(text).length > limit) errors.push({key,message:`${label}は${limit}文字以内でご入力ください。`});
  }
  if (String(values.productUrl||'').trim()) {
    try { normalizeBoothUrl(values.productUrl); } catch (error) { errors.push({key:'productUrl',message:error.message}); }
  }
  if (!/^\d{1,9}$/.test(values.price || '')) errors.push({key:'price',message:'参考価格は0以上の整数でご入力ください。'});
  if (values.clusterId && !/^[a-zA-Z0-9_-]{1,64}$/.test(values.clusterId)) errors.push({key:'clusterId',message:'clusterユーザーIDは英数字・ハイフン・アンダースコアでご入力ください（@は不要です）。'});
  if (values.contact && !/^[a-zA-Z0-9_]{1,15}$/.test(values.contact)) errors.push({key:'contact',message:'Xアカウントは@を付けず、15文字以内でご入力ください。'});
  if (!['アバター','衣装','アクセサリー','ギミック','楽曲','その他'].includes(values.category)) errors.push({key:'category',message:'カテゴリを選択してください。'});
  if (!['VRM','Unity','VRoid','Xwear','VRC','cluster','ギフト','その他'].includes(values.platform)) errors.push({key:'platform',message:'対応形式を選択してください。'});
  if (values.guestRequest && !values.clusterId) errors.push({key:'clusterId',message:'イベントゲスト枠をご希望の場合はclusterユーザーIDをご入力ください。'});
  if (values.guestRequest && values.guestRequest!=='希望します') errors.push({key:'guestRequest',message:'ゲスト枠希望の選択内容をご確認ください。'});
  return errors;
}

export function parsePastedProduct(text, fallbackUrl) {
  try { return parseProduct(JSON.parse(text), fallbackUrl); }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  const doc = new DOMParser().parseFromString(String(text), 'text/html');
  const meta = key => [...doc.querySelectorAll('meta')].find(item => (item.getAttribute('property') || item.getAttribute('name')) === key)?.content || '';
  let title = meta('og:title') || doc.title;
  title = title.replace(/\s*[-–|]\s*BOOTH\s*$/i, '').trim();
  const declaredUrl = meta('og:url') || fallbackUrl;
  return parseProduct({name:title, url:declaredUrl, description:meta('og:description') || meta('description'), images:[meta('og:image')]},fallbackUrl);
}
