function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function cleanText(value, max = 100) {
  return String(value ?? '').trim().slice(0, max);
}

function makePickupCode() {
  // 去掉容易看错的 0/O/1/I。
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += chars[b % chars.length];
  return code;
}

async function insertOrderWithUniqueCode(env, order, validItems, total) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pickupCode = makePickupCode();

    try {
      const orderInsert = await env.DB.prepare(`
        INSERT INTO orders
          (pickup_code, customer_name, phone, pickup_slot, note, total_cents)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        pickupCode,
        order.customerName,
        order.phone,
        order.pickupSlot,
        order.note,
        total
      ).run();

      const orderId = orderInsert.meta?.last_row_id;
      if (!orderId) throw new Error('未获得订单 ID');

      const itemStatements = validItems.map((item) => env.DB.prepare(`
        INSERT INTO order_items
          (order_id, product_id, product_name, price_cents, quantity)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        orderId,
        item.id,
        item.name,
        item.price_cents,
        item.quantity
      ));

      if (itemStatements.length) await env.DB.batch(itemStatements);

      return { orderId, pickupCode };
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes('UNIQUE') && message.includes('pickup_code')) continue;
      throw error;
    }
  }

  throw new Error('生成取餐码失败，请重试');
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);

  try {
    const body = await request.json();
    const customerName = cleanText(body.name, 40);
    const phone = cleanText(body.phone, 30);
    const pickupSlot = cleanText(body.pickup_slot, 60);
    const note = cleanText(body.note, 300);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!customerName) return json({ error: '请填写姓名' }, 400);
    if (!phone) return json({ error: '请填写手机号或联系方式' }, 400);
    if (!items.length) return json({ error: '请选择至少一件商品' }, 400);
    if (items.length > 30) return json({ error: '商品种类过多' }, 400);

    const quantityById = new Map();
    for (const raw of items) {
      const productId = Number(raw.product_id);
      const quantity = Number(raw.quantity);
      if (!Number.isInteger(productId) || productId <= 0) continue;
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 30) {
        return json({ error: '商品数量不正确' }, 400);
      }
      quantityById.set(productId, (quantityById.get(productId) || 0) + quantity);
    }

    if (!quantityById.size) return json({ error: '商品信息不正确' }, 400);

    const validItems = [];
    let total = 0;

    for (const [productId, quantity] of quantityById.entries()) {
      const product = await env.DB.prepare(`
        SELECT id, name, price_cents
        FROM products
        WHERE id = ? AND active = 1
      `).bind(productId).first();

      if (!product) return json({ error: '有商品已下架，请刷新页面' }, 400);

      total += Number(product.price_cents) * quantity;
      validItems.push({ ...product, quantity });
    }

    if (total <= 0 || total > 10000000) return json({ error: '订单金额异常' }, 400);

    const { orderId, pickupCode } = await insertOrderWithUniqueCode(
      env,
      { customerName, phone, pickupSlot, note },
      validItems,
      total
    );

    return json({
      success: true,
      order_id: orderId,
      pickup_code: pickupCode,
      total_cents: total,
      payment_status: 'pending',
      order_status: 'new'
    }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: '下单失败，请稍后重试' }, 500);
  }
}
