import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const DB = { prepare(sql) { const stmt = sqlite.prepare(sql); let values = []; return { bind(...args) { values = args; return this; }, async first() { return stmt.get(...values) || null; }, async all() { return { results: stmt.all(...values) }; }, async run() { const result = stmt.run(...values); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; } }; } };
  return (path, method = 'GET', body, authorized = true) => worker.fetch(new Request(`https://bakery.example/api/admin/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': 'test-token' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { ADMIN_TOKEN: 'test-token', DB });
}

test('founder records preserve gross payment, refunds and net expense', async t => {
  const call = setup(t);
  const expense = { spent_on: '2026-09-08', title: '三轮车台面不锈钢试验', category: 'EXPERIMENT', gross_paid_cents: 40000, refunded_cents: 20000, payment_method: '微信', payee: '车行', payment_reference: 'pay-1', refund_reference: 'refund-1', purpose: '未来企业筹建方案验证', outcome: '中途叫停，损伤车身且焊接质量不佳', disposal: '废料由商家处理，无回收款', business_relevance: 1, status: 'PENDING_CONVERSION', decision_id: '', evidence_note: '销售票据和付款记录' };
  assert.equal((await call('founder/expenses', 'POST', expense)).status, 201);
  let result = await (await call('founder/expenses')).json();
  assert.equal(result.records[0].gross_paid_cents, 40000);
  assert.equal(result.records[0].refunded_cents, 20000);
  assert.equal(result.records[0].net_amount_cents, 20000);
  assert.equal((await call('founder/expenses', undefined, undefined, false)).status, 401);
});

test('founder record validation rejects refunds above payment and bad methods', async t => {
  const call = setup(t);
  assert.equal((await call('founder/expenses', 'POST', { spent_on: '2026-09-08', title: '试验', category: 'EXPERIMENT', gross_paid_cents: 100, refunded_cents: 101, status: 'PENDING_CONVERSION' })).status, 400);
  assert.equal((await call('founder/expenses', 'PATCH', {})).status, 405);
});
