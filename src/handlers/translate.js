const MODEL = '@cf/meta/m2m100-1.2b';
const chinese = /[\u3400-\u9fff]/u;
const cache = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function translate({ request, env }) {
  if (!env.AI) return json({ error: '翻译服务未配置' }, 503);

  let texts;
  try {
    if (Number(request.headers.get('content-length')) > 6000) return json({ error: '请求过大' }, 413);
    ({ texts } = await request.json());
  } catch {
    return json({ error: '请求格式不正确' }, 400);
  }

  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 40 ||
    texts.some((text) => typeof text !== 'string' || text.length === 0 || text.length > 200) ||
    texts.reduce((length, text) => length + text.length, 0) > 4000) {
    return json({ error: '翻译文本不正确' }, 400);
  }

  if (env.TRANSLATE_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.TRANSLATE_LIMITER.limit({ key });
    if (!success) return json({ error: '翻译请求过于频繁' }, 429);
  }

  try {
    const unique = [...new Set(texts)];
    const results = new Map();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, unique.length) }, async () => {
      while (next < unique.length) {
        const text = unique[next++];
        if (!chinese.test(text)) { results.set(text, text); continue; }
        if (cache.has(text)) { results.set(text, cache.get(text)); continue; }
        const result = await env.AI.run(MODEL, { text, source_lang: 'zh', target_lang: 'en' });
        const translated = result?.translated_text?.trim();
        if (!translated) throw new Error('Empty translation result');
        results.set(text, translated);
        if (cache.size >= 500) cache.delete(cache.keys().next().value);
        cache.set(text, translated);
      }
    }));
    return json({ translations: texts.map((text) => results.get(text)) });
  } catch (error) {
    console.error('Translation failed', error);
    return json({ error: '翻译暂时不可用' }, 502);
  }
}
