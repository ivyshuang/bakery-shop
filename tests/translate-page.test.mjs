import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/translate.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('storefront shows bilingual captions without a language switch', () => {
  assert.doesNotMatch(page, /id="languageToggle"/);
  assert.match(page, /今天有什么 <small class="en-caption" lang="en" data-no-translate>Today's menu<\/small>/);
});

test('AI product translations are cached after the first request', async () => {
  const requests = [];
  const stored = new Map();
  const context = {
    localStorage: {
      getItem(key) { return stored.get(key) || null; },
      setItem(key, value) { stored.set(key, value); }
    },
    fetch: async (_url, options) => {
      const texts = JSON.parse(options.body).texts;
      requests.push(texts);
      return { ok: true, async json() { return { translations: texts.map((value) => `EN:${value}`) }; } };
    },
    window: { alert() {} }
  };
  vm.runInNewContext(script, context);

  const first = await context.window.storefrontTranslator.translate(['海盐卷', '原味贝果', '海盐卷']);
  assert.deepEqual(Array.from(first), ['EN:海盐卷', 'EN:原味贝果', 'EN:海盐卷']);
  const second = await context.window.storefrontTranslator.translate(['原味贝果', 'Plain Bagel']);
  assert.deepEqual(Array.from(second), ['EN:原味贝果', 'Plain Bagel']);
  assert.deepEqual(requests, [['海盐卷', '原味贝果']]);
  assert.ok(stored.has('bakery_translations_en_v1'));
});
