import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { parseImage } from '../src/product-image.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const req = (path, method = 'GET', body, token = 'secret') => new Request(`https://bakery.example${path}`, {
  method, headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test('image validation accepts raster data and rejects SVG, spoofed and oversized data', () => {
  assert.equal(parseImage(image).type, 'image/png');
  assert.equal(parseImage(''), null);
  for (const invalid of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'x'.repeat(700001), null]) {
    assert.throws(() => parseImage(invalid));
  }
});

test('product image upload requires admin authorization and validates before writing', async () => {
  let writes = 0;
  const env = { ADMIN_TOKEN: 'secret', DB: { prepare() { writes++; throw new Error('unexpected write'); } } };
  assert.equal((await worker.fetch(req('/api/admin/product/1', 'PATCH', { image_data: image }, ''), env)).status, 401);
  assert.equal((await worker.fetch(req('/api/admin/product/1', 'PATCH', { image_data: 'invalid' }), env)).status, 400);
  assert.equal(writes, 0);
});

test('create, replace and read a product photo', async () => {
  let stored = '';
  const env = { ADMIN_TOKEN: 'secret', DB: { prepare(sql) { return { bind(...values) { return {
    async run() { stored = sql.includes('INSERT') ? values[5] : values[0]; return { meta: { changes: 1, last_row_id: 1 } }; },
    async first() { return { image_data: stored }; }
  }; } }; } } };
  assert.equal((await worker.fetch(req('/api/admin/products', 'POST', { name: '面包', price_cents: 1200, image_data: image }), env)).status, 201);
  assert.equal(stored, image);
  const response = await worker.fetch(req('/api/product/1/image'), env);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), parseImage(image).bytes);
  assert.equal((await worker.fetch(req('/api/admin/product/1', 'PATCH', { image_data: '' }), env)).status, 200);
  assert.equal((await worker.fetch(req('/api/product/1/image'), env)).status, 404);
  assert.equal((await worker.fetch(req('/api/product/1/image', 'POST'), env)).status, 405);
});
