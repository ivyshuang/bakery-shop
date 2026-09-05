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
      SELECT id, name, description, price_cents, emoji, active, sort_order
      FROM products
      ORDER BY sort_order ASC, id ASC
    `).all();
    return json({ products: results || [] });
  } catch (error) {
    console.error(error);
    return json({ error: '读取商品失败' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  try {
    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 60);
    const description = String(body.description || '').trim().slice(0, 200);
    const emoji = String(body.emoji || '🥐').trim().slice(0, 8) || '🥐';
    const priceCents = Number(body.price_cents);
    const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

    if (!name) return json({ error: '请输入商品名' }, 400);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10000000) {
      return json({ error: '价格不正确' }, 400);
    }

    const result = await env.DB.prepare(`
      INSERT INTO products (name, description, price_cents, emoji, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(name, description, priceCents, emoji, sortOrder).run();

    return json({ success: true, id: result.meta?.last_row_id }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: '新增商品失败' }, 500);
  }
}
