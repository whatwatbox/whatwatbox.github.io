import { safeThumbnailUrl } from './catalog-core.js';

// One public request serves all missing images, even when several fail together.
export function createThumbnailRecovery(getEndpoint) {
  let pending;
  let fetchedAt = 0;
  return async function recoverThumbnail(expectedUrl) {
    if (!safeThumbnailUrl(expectedUrl)) throw new Error('Invalid image URL');
    if (!pending || Date.now() - fetchedAt > 60_000) {
      fetchedAt = Date.now();
      pending = (async () => {
        const url = new URL(await getEndpoint());
        if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || url.username || url.password) {
          throw new Error('Invalid catalog endpoint');
        }
        url.searchParams.set('action', 'publicCatalog');
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
        if (!response.ok) throw new Error('Catalog image request failed');
        const data = await response.json();
        if (data?.ok !== true || data.v !== 1 || !Array.isArray(data.items) || data.items.length > 1000) {
          throw new Error('Invalid public catalog');
        }
        const images = new Map();
        await Promise.all(data.items.map(async item => {
          const image = item?.thumbnail;
          if (!/^p-[a-f0-9]{20}$/.test(item?.id || '') || typeof image !== 'string'
              || image.length > 300_000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image)) return;
          const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image));
          const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
          images.set('https://watbox.net/bingo_3/catalog/media/' + item.id + '-' + hex.slice(0, 20) + '.jpg', image);
        }));
        return images;
      })();
    }
    const image = (await pending).get(expectedUrl);
    if (!image) throw new Error('Matching public image is unavailable');
    return image;
  };
}
