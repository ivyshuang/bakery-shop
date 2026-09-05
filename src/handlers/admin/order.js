function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function updateOrder({ request, env, params }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);

  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: '订单 ID 不正确' }, 400);

  try {
    const body = await request.json();
    const updates = [];
    const binds = [];

    if (body.payment_status !== undefined) {
      if (!['pending','paid'].includes(body.payment_status)) {
        return json({ error: '付款状态不正确' }, 400);
      }
      updates.push('payment_status = ?');
      binds.push(body.payment_status);
    }

    if (body.order_status !== undefined) {
      if (!['new','preparing','ready','completed','cancelled'].includes(body.order_status)) {
        return json({ error: '订单状态不正确' }, 400);
      }
      updates.push('order_status = ?');
      binds.push(body.order_status);
    }

    if (!updates.length) return json({ error: '没有需要修改的内容' }, 400);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    binds.push(orderId);

    const result = await env.DB.prepare(`
      UPDATE orders
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...binds).run();

    if (!result.meta?.changes) return json({ error: '订单不存在' }, 404);
    return json({ success: true });
  } catch (error) {
    console.error(error);
    return json({ error: '更新订单失败' }, 500);
  }
}
