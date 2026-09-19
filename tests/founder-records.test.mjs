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
  const objects = new Map();
  const PROCUREMENT_FILES = { async put(key, value, options) { objects.set(key, { value, options }); }, async get(key) { const item = objects.get(key); return item ? { body: item.value, httpMetadata: item.options?.httpMetadata } : null; }, async delete(key) { objects.delete(key); } };
  const env = { ADMIN_TOKEN: 'test-token', DB, PROCUREMENT_FILES };
  const call = (path, method = 'GET', body, authorized = true) => worker.fetch(new Request(`https://bakery.example/api/admin/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authorized ? { 'X-Admin-Token': 'test-token' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  call.env = env; call.sqlite = sqlite; call.objects = objects;
  return call;
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

test('uploading one order PDF creates a simple expense record', async t => {
  const call = setup(t);
  const response = await call('founder/expenses/import', 'POST', { file_name: '淘宝烤箱订单.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' });
  assert.equal(response.status, 201);
  const data = await (await call('founder/expenses')).json();
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].title, '淘宝烤箱订单');
  assert.equal(data.records[0].files[0].file_name, '淘宝烤箱订单.pdf');
  assert.equal(call.objects.size, 1);
});

test('receipt email attachments stay pending until linked to an expense', async t => {
  const call = setup(t);
  const expense = await (await call('founder/expenses/import', 'POST', { file_name: '订单.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' })).json();
  const raw = `Message-ID: <receipt-1@example.com>\r\nFrom: pay@example.com\r\nTo: receipts@bakery.example\r\nSubject: =?UTF-8?B?5LuY5qy+5Yet6K+B?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nreceipt\r\n--x\r\nContent-Type: application/pdf; name="proof.pdf"\r\nContent-Disposition: attachment; filename="proof.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0xLjQK\r\n--x--\r\n`;
  await worker.email({ raw: new Blob([raw]).stream(), headers: new Headers({ 'Message-ID': '<receipt-1@example.com>' }), from: 'pay@example.com', to: 'receipts@bakery.example' }, call.env, {});
  let inbox = await (await call('founder/receipts')).json();
  assert.equal(inbox.records.length, 1);
  assert.equal(inbox.records[0].status, 'PENDING');
  assert.equal(inbox.records[0].files[0].file_name, 'proof.pdf');
  assert.equal((await call(`founder/receipts/${inbox.records[0].id}/link`, 'POST', { expense_id: expense.id })).status, 200);
  inbox = await (await call('founder/receipts')).json();
  assert.equal(inbox.records[0].status, 'LINKED');
  const record = await (await call(`founder/expenses/${expense.id}`)).json();
  assert.deepEqual(record.record.files.map(file => file.file_name), ['订单.pdf', 'proof.pdf']);
  assert.equal((await call(`founder/expenses/${expense.id}`, 'DELETE')).status, 200);
  inbox = await (await call('founder/receipts')).json();
  assert.equal(inbox.records[0].status, 'PENDING');
  assert.equal(inbox.records[0].files[0].file_name, 'proof.pdf');
  assert.equal((await call(`founder/receipts/${inbox.records[0].id}`, 'DELETE')).status, 200);
  const emptyInbox = await (await call('founder/receipts')).json();
  assert.equal(emptyInbox.records.length, 0);
});

test('founder receipt migrations work with the current remote expense shape', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../migrations/0006_founder_decisions.sql', import.meta.url), 'utf8'));
    sqlite.exec(`CREATE TABLE founder_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, spent_on TEXT NOT NULL, title TEXT NOT NULL,
      category TEXT NOT NULL, gross_paid_cents INTEGER NOT NULL, refunded_cents INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT '', payee TEXT NOT NULL DEFAULT '', payment_reference TEXT NOT NULL DEFAULT '',
      refund_reference TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '',
      disposal TEXT NOT NULL DEFAULT '', business_relevance INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING_CONVERSION', decision_id INTEGER REFERENCES founder_decisions(id),
      evidence_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migration8 = readFileSync(new URL('../migrations/0008_founder_expense_files.sql', import.meta.url), 'utf8');
    const migration9 = readFileSync(new URL('../migrations/0009_receipt_inbox.sql', import.meta.url), 'utf8');
    sqlite.exec(migration8); sqlite.exec(migration9); sqlite.exec(migration8); sqlite.exec(migration9);
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'founder_expense_files'").get());
    assert.ok(sqlite.prepare("SELECT name FROM pragma_table_info('founder_expense_files') WHERE name = 'source_receipt_file_id'").get());
  } finally { sqlite.close(); }
});
