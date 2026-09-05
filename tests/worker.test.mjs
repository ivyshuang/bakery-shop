import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

function request(path, init) {
  return new Request(`https://bakery.example${path}`, init);
}

const assets = {
  fetch(req) {
    return new Response(`asset:${new URL(req.url).pathname}`);
  }
};

test('non-API requests are served by the static asset binding', async () => {
  const response = await worker.fetch(request('/admin/'), { ASSETS: assets });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset:/admin/');
});

test('public API route reaches its Worker handler', async () => {
  const response = await worker.fetch(request('/api/products'), { ASSETS: assets });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'D1 binding DB 未配置' });
});

test('admin API routes require ADMIN_TOKEN', async () => {
  const response = await worker.fetch(request('/api/admin/orders'), {
    ASSETS: assets,
    ADMIN_TOKEN: 'secret'
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: '未授权' });
});

test('unsupported methods return 405 and an Allow header', async () => {
  const response = await worker.fetch(request('/api/products', { method: 'POST' }), {
    ASSETS: assets
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET');
});

test('unknown API routes return JSON 404 instead of a static page', async () => {
  const response = await worker.fetch(request('/api/missing'), { ASSETS: assets });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'API 路由不存在' });
});
