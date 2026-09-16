import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const supply = { name: '定制印章', specification: '直径 4cm', category: 'TOOL', unit: '个', purchase_type: 'ONE_TIME' };
const purchase = { supply_id: 1, quantity: 1, amount_cents: 3500, platform: '淘宝', shop: '印章店', purchased_on: '2026-09-16', product_url: 'https://example.com/stamp', order_number: 'TB123' };

export function makeDatabase(schema = 'schema.sql') {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL(`../${schema}`, import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return stmt.get(...values) || null; },
        async all() { return { results: stmt.all(...values) }; },
        async run() { const r = stmt.run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      };
    }
  };
  return { sqlite, DB };
}
function setup(t) {
  const { sqlite, DB } = makeDatabase();
  t.after(() => sqlite.close());
  const env = { ADMIN_TOKEN: 'test-token', DB };
  return (path, method = 'GET', body, authorized = true) => worker.fetch(new Request(`https://bakery.example/api/admin/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': 'test-token' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

test('procurement migration is repeatable and does not alter existing sales tables', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO products VALUES (1, \'面包\')');
    const migration = readFileSync(new URL('../migrations/0003_procurement.sql', import.meta.url), 'utf8');
    db.exec(migration); db.exec(migration);
    assert.equal(db.prepare('SELECT name FROM products').get().name, '面包');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM supplies').get().n, 0);
  } finally { db.close(); }
});

test('purchase CRUD retains multiple purchases, edits metadata and preserves screenshots unless explicitly removed', async t => {
  const call = setup(t);
  assert.equal((await call('supplies', 'POST', supply)).status, 201);
  assert.equal((await call('purchases', 'POST', { ...purchase, image_data: image })).status, 201);
  assert.equal((await call('purchases', 'POST', { ...purchase, quantity: 2, purchased_on: '2026-09-17' })).status, 201);
  let result = await (await call('purchases')).json();
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].purchased_on, '2026-09-17');
  assert.equal(result.records[1].has_image, 1);
  assert.equal('image_data' in result.records[1], false);
  assert.equal((await call('purchases/1', 'PATCH', { ...purchase, amount_cents: 2500 })).status, 200);
  const screenshot = await call('purchases/1/image');
  assert.equal(screenshot.status, 200);
  assert.equal(screenshot.headers.get('Content-Type'), 'image/png');
  assert.ok((await screenshot.arrayBuffer()).byteLength > 0);
  assert.equal((await call('purchases/1')).status, 200);
  assert.equal((await call('purchases/1', 'PATCH', { ...purchase, image_data: '' })).status, 200);
  assert.equal((await call('purchases/1/image')).status, 404);
  assert.equal((await call('supplies/1', 'PATCH', { ...supply, purchase_type: 'RECURRING' })).status, 200);
  result = await (await call('supplies')).json();
  assert.equal(result.records[0].purchase_type, 'RECURRING');
});

test('all procurement data and screenshots require authorization; unsupported methods and missing IDs fail', async t => {
  const call = setup(t);
  for (const path of ['supplies', 'purchases', 'supplies/1', 'purchases/1', 'purchases/1/image']) {
    assert.equal((await call(path, 'GET', undefined, false)).status, 401);
  }
  assert.equal((await call('supplies', 'POST', supply, false)).status, 401);
  assert.equal((await call('supplies/1', 'PATCH', supply, false)).status, 401);
  assert.equal((await call('purchases/1', 'DELETE')).status, 405);
  assert.equal((await call('supplies/999', 'PATCH', supply)).status, 404);
  assert.equal((await call('purchases/999')).status, 404);
  assert.equal((await call('purchases/1/image', 'POST', {})).status, 405);
});

test('invalid amounts, units, dates, images and links never produce purchase records', async t => {
  const call = setup(t);
  assert.equal((await call('supplies', 'POST', { ...supply, purchase_type: 'INVALID' })).status, 400);
  assert.equal((await call('supplies', 'POST', { ...supply, unit: '' })).status, 400);
  await call('supplies', 'POST', supply);
  for (const changes of [
    { supply_id: 999 }, { quantity: 0 }, { quantity: -1 }, { quantity: '1' },
    { amount_cents: -1 }, { amount_cents: 1.5 }, { amount_cents: null },
    { purchased_on: '2026-02-30' }, { platform: '' }, { shop: '' },
    { product_url: 'javascript:alert(1)' }, { image_data: 'data:image/png;base64,aGVsbG8=' }
  ]) assert.equal((await call('purchases', 'POST', { ...purchase, ...changes })).status, 400, JSON.stringify(changes));
  assert.equal((await (await call('purchases')).json()).records.length, 0);
  assert.equal((await call('purchases', 'POST', { ...purchase, quantity: 0.5 })).status, 201);
  assert.equal((await call('supplies/1', 'PATCH', { ...supply, unit: '盒' })).status, 400);
  assert.equal((await (await call('supplies/1')).json()).record.unit, '个');
});
