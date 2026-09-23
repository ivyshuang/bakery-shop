import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../public/translate.js', import.meta.url), 'utf8');
const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

test('language toggle translates existing and newly added Chinese, then restores originals', async () => {
  const nodes = [];
  const elements = [];
  const makeText = (value, parentElement) => {
    const node = { nodeValue: value, parentElement };
    nodes.push(node);
    return node;
  };
  const makeElement = (value = '', attributes = {}) => {
    const element = {
      attributes,
      hasAttribute(name) { return name in this.attributes; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      closest(selector) { return selector.includes('[data-no-translate]') && this.noTranslate ? this : null; },
      classList: { toggle() {} }
    };
    elements.push(element);
    if (value) element.firstChild = makeText(value, element);
    return element;
  };
  const title = makeElement('RO·今日烘焙');
  const meta = makeElement('', { content: '今日现烤，到店自提。' });
  const product = makeElement('海盐卷', { title: '海盐卷' });
  const placeholder = makeElement('', { placeholder: '怎么称呼你' });
  const status = makeElement();
  status.noTranslate = true;
  status.textContent = '';
  status.hidden = true;
  const languageParts = [{ dataset: { lang: 'zh' }, classList: { toggle() {} } }, { dataset: { lang: 'en' }, classList: { toggle() {} } }];
  const toggle = makeElement();
  toggle.noTranslate = true;
  toggle.querySelectorAll = () => languageParts;
  toggle.addEventListener = (_event, callback) => { toggle.click = callback; };
  const document = {
    body: {}, documentElement: { lang: 'zh-CN' },
    querySelector(selector) { return ({ title, 'meta[name="description"]': meta, '#languageToggle': toggle, '#languageStatus': status })[selector]; },
    querySelectorAll() { return elements; },
    createTreeWalker() { let index = -1; return { get currentNode() { return nodes[index]; }, nextNode() { return ++index < nodes.length; } }; }
  };
  let mutated;
  class MutationObserver { constructor(callback) { mutated = callback; } observe() {} }
  const requests = [];
  const context = { document, NodeFilter: { SHOW_TEXT: 4 }, MutationObserver, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} }, console,
    fetch: async (_url, options) => {
      const texts = JSON.parse(options.body).texts;
      requests.push(texts);
      return { ok: true, async json() { return { translations: texts.map((text) => `EN:${text}`) }; } };
    },
    window: { alert() {} }
  };
  vm.runInNewContext(script, context);

  toggle.click();
  await wait();
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(product.firstChild.nodeValue, 'EN:海盐卷');
  assert.equal(product.getAttribute('title'), 'EN:海盐卷');
  assert.equal(placeholder.getAttribute('placeholder'), 'EN:怎么称呼你');
  assert.equal(title.firstChild.nodeValue, 'EN:RO·今日烘焙');
  assert.equal(meta.getAttribute('content'), 'EN:今日现烤，到店自提。');

  const newProduct = makeElement('原味贝果');
  mutated();
  await wait();
  assert.equal(newProduct.firstChild.nodeValue, 'EN:原味贝果');

  toggle.click();
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(product.firstChild.nodeValue, '海盐卷');
  assert.equal(newProduct.firstChild.nodeValue, '原味贝果');
  assert.equal(placeholder.getAttribute('placeholder'), '怎么称呼你');
  assert.equal(requests.length, 2);
});
