(() => {
  const chinese = /[\u3400-\u9fff]/u;
  const cache = new Map();
  const cacheKey = 'bakery_translations_en_v1';

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

  async function translateTexts(texts) {
    const missing = [...new Set(texts.filter((value) => chinese.test(value) && !cache.has(value)))];
    for (let index = 0; index < missing.length;) {
      const batch = [];
      let length = 0;
      while (index < missing.length && batch.length < 30 && length + missing[index].length <= 3500) {
        batch.push(missing[index]);
        length += missing[index].length;
        index++;
      }
      if (!batch.length) throw new Error('Translation text is too long');
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

  window.storefrontTranslator = {
    translate: translateTexts,
    alert(message) { window.alert(String(message)); }
  };
})();
