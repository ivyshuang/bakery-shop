(() => {
  const chinese = /[\u3400-\u9fff]/u;
  const attributes = ['placeholder', 'aria-label', 'alt', 'title'];
  const cache = new Map();
  const tracked = new Set();
  const toggle = document.querySelector('#languageToggle');
  const status = document.querySelector('#languageStatus');
  const storageKey = 'bakery_language';
  const cacheKey = 'bakery_translations_en_v1';
  let language = 'zh';
  let generation = 0;
  let timer;
  let working = false;
  let needsScan = false;
  let records = new WeakMap();

  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    if (Array.isArray(saved)) {
      saved.slice(-300).forEach((entry) => {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') cache.set(entry[0], entry[1]);
      });
    }
  } catch { /* Translation works without local storage. */ }

  function saveCache() {
    while (cache.size > 300) cache.delete(cache.keys().next().value);
    try { localStorage.setItem(cacheKey, JSON.stringify([...cache])); } catch { /* Storage can be unavailable. */ }
  }

  function showStatus(message) {
    if (status.textContent !== message) status.textContent = message;
    status.hidden = !message;
  }

  function getValue(target) {
    return target.attribute ? target.node.getAttribute(target.attribute) : target.node.nodeValue;
  }

  function setValue(target, value) {
    if (target.attribute) target.node.setAttribute(target.attribute, value);
    else target.node.nodeValue = value;
  }

  function recordFor(node, attribute) {
    let byAttribute = records.get(node);
    if (!byAttribute) { byAttribute = new Map(); records.set(node, byAttribute); }
    let record = byAttribute.get(attribute);
    if (!record) {
      record = { node, attribute, source: '', translated: '' };
      byAttribute.set(attribute, record);
      tracked.add(record);
    }
    return record;
  }

  function collect() {
    const candidates = [];
    const visit = (node, attribute = null) => {
      const value = attribute ? node.getAttribute(attribute) : node.nodeValue;
      if (!value || !chinese.test(value) || value.length > 200) return;
      const record = recordFor(node, attribute);
      if (record.translated === value) return;
      record.source = value;
      record.translated = '';
      candidates.push(record);
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (parent && !parent.closest('script, style, noscript, template, textarea, [data-no-translate]')) visit(node);
    }
    visit(document.querySelector('title').firstChild);
    const description = document.querySelector('meta[name="description"]');
    if (description) visit(description, 'content');
    document.querySelectorAll('*').forEach((element) => {
      if (element.closest('[data-no-translate]')) return;
      for (const attribute of attributes) {
        if (element.hasAttribute(attribute)) visit(element, attribute);
      }
    });
    return candidates;
  }

  async function translateTexts(texts) {
    const missing = [...new Set(texts.filter((value) => chinese.test(value) && !cache.has(value)))];
    for (let index = 0; index < missing.length;) {
      if (missing[index].length > 200) throw new Error('Translation text is too long');
      const batch = [];
      let length = 0;
      while (index < missing.length && batch.length < 30 && length + missing[index].length <= 3500) {
        batch.push(missing[index]);
        length += missing[index].length;
        index++;
      }
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch })
      });
      if (!response.ok) throw new Error('Translation unavailable');
      const data = await response.json();
      if (!Array.isArray(data.translations) || data.translations.length !== batch.length ||
        data.translations.some((value) => typeof value !== 'string' || !value.trim())) {
        throw new Error('Invalid translation response');
      }
      batch.forEach((value, offset) => cache.set(value, data.translations[offset]));
      saveCache();
    }
    return texts.map((value) => cache.get(value) || value);
  }

  async function translatePage() {
    if (language !== 'en' || working) return;
    working = true;
    const run = generation;
    try {
      let candidates = collect();
      while (candidates.length && language === 'en' && run === generation) {
        showStatus('Translating…');
        await translateTexts(candidates.map((record) => record.source));
        if (language !== 'en' || run !== generation) break;
        for (const record of candidates) {
          if (getValue(record) !== record.source) continue;
          const leading = record.source.match(/^\s*/u)[0];
          const trailing = record.source.match(/\s*$/u)[0];
          record.translated = leading + cache.get(record.source) + trailing;
          setValue(record, record.translated);
        }
        candidates = collect();
      }
      if (language === 'en' && run === generation) showStatus('');
    } catch (error) {
      console.error(error);
      if (language === 'en' && run === generation) {
        setLanguage('zh');
        showStatus('翻译暂时不可用，请稍后重试');
      }
    } finally {
      working = false;
      if (needsScan && language === 'en') { needsScan = false; schedule(); }
    }
  }

  function schedule() {
    if (language !== 'en') return;
    if (working) { needsScan = true; return; }
    if (timer) return;
    timer = setTimeout(() => { timer = undefined; translatePage(); }, 40);
  }

  function setLanguage(next) {
    generation++;
    language = next;
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    toggle.setAttribute('aria-label', next === 'en' ? '切换为中文' : 'Switch to English');
    toggle.querySelectorAll('[data-lang]').forEach((element) => element.classList.toggle('active', element.dataset.lang === next));
    try { localStorage.setItem(storageKey, next); } catch { /* Storage can be unavailable. */ }
    showStatus('');
    if (next === 'zh') {
      for (const record of tracked) {
        if (getValue(record) === record.translated) setValue(record, record.source);
      }
      tracked.clear();
      records = new WeakMap();
    } else {
      schedule();
    }
  }

  toggle.addEventListener('click', () => setLanguage(language === 'zh' ? 'en' : 'zh'));
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [...attributes, 'content']
  });
  window.storefrontTranslator = {
    async alert(message) {
      let value = String(message);
      if (language === 'en' && chinese.test(value)) {
        try { [value] = await translateTexts([value]); } catch (error) { console.error(error); }
      }
      window.alert(value);
    }
  };
  try { if (localStorage.getItem(storageKey) === 'en') setLanguage('en'); }
  catch { /* Storage can be unavailable. */ }
  if (language === 'zh') setLanguage('zh');
})();
