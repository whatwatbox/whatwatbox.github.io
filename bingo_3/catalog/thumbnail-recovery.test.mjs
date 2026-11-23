import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { createThumbnailRecovery } from './thumbnail-recovery.js';

globalThis.crypto ??= webcrypto;
test('missing public images share one request and match the expected content hash', async () => {
  const originalFetch = globalThis.fetch;
  const image = 'data:image/jpeg;base64,' + Buffer.from('ffd8ffe00004ffd9', 'hex').toString('base64');
  const id = 'p-' + 'a'.repeat(20);
  const hash = createHash('sha256').update(image).digest('hex').slice(0, 20);
  const url = 'https://watbox.net/bingo_3/catalog/media/' + id + '-' + hash + '.jpg';
  let requests = 0;
  globalThis.fetch = async request => {
    requests++;
    assert.equal(new URL(request).searchParams.get('action'), 'publicCatalog');
    return Response.json({ ok: true, v: 1, items: [{ id, thumbnail: image }] });
  };
  try {
    const recover = createThumbnailRecovery(() => 'https://script.google.com/macros/s/public/exec');
    assert.deepEqual(await Promise.all([recover(url), recover(url)]), [image, image]);
    assert.equal(requests, 1);
    await assert.rejects(recover(url.replace(hash, 'b'.repeat(20))), /Matching public image/);
    await assert.rejects(recover('https://example.com/image.jpg'), /Invalid image URL/);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
