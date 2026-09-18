import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

const decision = {
  title: '测试决策',
  decided_on: '2026-09-18',
  status: 'ACTIVE',
  problem: '怎样验证？',
  experiment: '先做小样。',
  outcome: '小样有效。',
  decision: '采用小样方案。',
  principle: '先验证，再投入。',
  scope: '新设备。'
};

function makeDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return statement.get(...values) || null; },
        async all() { return { results: statement.all(...values) }; },
        async run() {
          const result = statement.run(...values);
          return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        }
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
    method,
    headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': 'test-token' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

test('founder decision migration is repeatable and seeds the tricycle decision once', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const migration = readFileSync(new URL('../migrations/0006_founder_decisions.sql', import.meta.url), 'utf8');
    db.exec(migration);
    db.exec(migration);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM founder_decisions').get().n, 1);
    assert.equal(db.prepare('SELECT title FROM founder_decisions').get().title, '三轮车台面安装');
  } finally {
    db.close();
  }
});

test('decision records support authorized create, list, edit and delete', async t => {
  const call = setup(t);
  const initial = await (await call('decisions')).json();
  assert.equal(initial.records.length, 1);
  assert.equal((await call('decisions', 'POST', decision)).status, 201);
  let result = await (await call('decisions')).json();
  const created = result.records.find(record => record.title === decision.title);
  assert.ok(created);
  assert.equal((await call(`decisions/${created.id}`, 'PATCH', { ...decision, status: 'ARCHIVED' })).status, 200);
  result = await (await call(`decisions/${created.id}`)).json();
  assert.equal(result.record.status, 'ARCHIVED');
  assert.equal((await call(`decisions/${created.id}`, 'DELETE')).status, 200);
  assert.equal((await call(`decisions/${created.id}`)).status, 404);
});

test('decision validation, authorization and methods are enforced', async t => {
  const call = setup(t);
  assert.equal((await call('decisions', 'GET', undefined, false)).status, 401);
  assert.equal((await call('decisions', 'POST', decision, false)).status, 401);
  assert.equal((await call('decisions', 'POST', { ...decision, title: '' })).status, 400);
  assert.equal((await call('decisions', 'POST', { ...decision, decided_on: '2026-02-30' })).status, 400);
  assert.equal((await call('decisions', 'POST', { ...decision, status: 'UNKNOWN' })).status, 400);
  assert.equal((await call('decisions', 'PUT', decision)).status, 405);
  assert.equal((await call('decisions/999', 'DELETE')).status, 404);
});
