function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: '商品 ID 不正确' }, 400);

  try {
    const body = await request.json();
    const fields = [];
    const binds = [];

    if (body.name !== undefined) {
      const value = String(body.name).trim().slice(0, 60);
      if (!value) return json({ error: '商品名不能为空' }, 400);
      fields.push('name = ?'); binds.push(value);
    }
    if (body.description !== undefined) {
      fields.push('description = ?'); binds.push(String(body.description).trim().slice(0, 200));
    }
    if (body.emoji !== undefined) {
      fields.push('emoji = ?'); binds.push(String(body.emoji || '🥐').trim().slice(0, 8) || '🥐');
    }
    if (body.price_cents !== undefined) {
      const value = Number(body.price_cents);
      if (!Number.isInteger(value) || value < 0 || value > 10000000) return json({ error: '价格不正确' }, 400);
      fields.push('price_cents = ?'); binds.push(value);
    }
    if (body.active !== undefined) {
      const value = Number(body.active) ? 1 : 0;
      fields.push('active = ?'); binds.push(value);
    }
    if (body.sort_order !== undefined) {
      const value = Number(body.sort_order);
      if (!Number.isFinite(value)) return json({ error: '排序不正确' }, 400);
      fields.push('sort_order = ?'); binds.push(value);
    }

    if (!fields.length) return json({ error: '没有需要修改的内容' }, 400);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    binds.push(id);

    const result = await env.DB.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
    if (!result.meta?.changes) return json({ error: '商品不存在' }, 404);
    return json({ success: true });
  } catch (error) {
    console.error(error);
    return json({ error: '更新商品失败' }, 500);
  }
}
