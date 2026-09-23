import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const request = (texts, method = 'POST') => new Request('https://bakery.example/api/translate', {
  method,
  ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts }) } : {})
});

test('translation converts Chinese page text through Workers AI without changing product data', async () => {
  const calls = [];
  const env = { AI: { async run(model, input) {
    calls.push({ model, input });
    return { translated_text: input.text === '海盐卷' ? 'Sea Salt Roll' : 'Freshly baked today' };
  } } };
  const response = await worker.fetch(request(['海盐卷', '今日现烤', '海盐卷', 'EN']), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { translations: ['Sea Salt Roll', 'Freshly baked today', 'Sea Salt Roll', 'EN'] });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].input, { text: '海盐卷', source_lang: 'zh', target_lang: 'en' });
});

test('translation requires a configured service and rejects oversized or invalid input', async () => {
  assert.equal((await worker.fetch(request(['中文']), {})).status, 503);
  const env = { AI: { run() { throw new Error('AI should not run'); } } };
  assert.equal((await worker.fetch(request([], 'GET'), env)).status, 405);
  assert.equal((await worker.fetch(request(['中文'.repeat(101)]), env)).status, 400);
  assert.equal((await worker.fetch(request(Array(41).fill('中文')), env)).status, 400);
  assert.equal((await worker.fetch(request([123]), env)).status, 400);
  const limited = { AI: env.AI, TRANSLATE_LIMITER: { async limit() { return { success: false }; } } };
  assert.equal((await worker.fetch(request(['中文']), limited)).status, 429);
});
