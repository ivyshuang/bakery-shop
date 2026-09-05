function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
    const orderStatus = (url.searchParams.get('order_status') || '').trim();
    const paymentStatus = (url.searchParams.get('payment_status') || '').trim();

    const where = [];
    const binds = [];

    if (q) {
      where.push('(o.pickup_code LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ?)');
      const like = `%${q}%`;
      binds.push(like, like, like);
    }

    if (['new','preparing','ready','completed','cancelled'].includes(orderStatus)) {
      where.push('o.order_status = ?');
      binds.push(orderStatus);
    }

    if (['pending','paid'].includes(paymentStatus)) {
      where.push('o.payment_status = ?');
      binds.push(paymentStatus);
    }

    const sql = `
      SELECT
        o.id, o.pickup_code, o.customer_name, o.phone, o.pickup_slot, o.note,
        o.total_cents, o.payment_status, o.order_status, o.created_at, o.updated_at,
        COALESCE((
          SELECT json_group_array(json_object(
            'product_name', oi.product_name,
            'price_cents', oi.price_cents,
            'quantity', oi.quantity
          ))
          FROM order_items oi WHERE oi.order_id = o.id
        ), '[]') AS items_json
      FROM orders o
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.id DESC
      LIMIT 200
    `;

    const statement = env.DB.prepare(sql).bind(...binds);
    const { results } = await statement.all();
    const orders = (results || []).map((row) => ({
      ...row,
      items: JSON.parse(row.items_json || '[]'),
      items_json: undefined
    }));

    return json({ orders });
  } catch (error) {
    console.error(error);
    return json({ error: '读取订单失败' }, 500);
  }
}
