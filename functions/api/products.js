function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, name, description, price_cents, emoji
      FROM products
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    return json({ products: results || [] });
  } catch (error) {
    console.error(error);
    return json({ error: '读取商品失败' }, 500);
  }
}
