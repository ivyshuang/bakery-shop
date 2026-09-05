import {
  centsFromAlipayAmount,
  verifyAlipayNotification
} from '../payments/alipay.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function notifyResponse(success, status = 200) {
  return new Response(success ? 'success' : 'failure', {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function getOrderPaymentStatus({ request, env, params }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const orderId = Number(params.id);
  const pickupCode = (new URL(request.url).searchParams.get('pickup_code') || '').trim().toUpperCase();
  if (!Number.isInteger(orderId) || orderId <= 0 || !pickupCode) {
    return json({ error: '订单信息不正确' }, 400);
  }

  try {
    const order = await env.DB.prepare(`
      SELECT id, pickup_code, total_cents, payment_status, order_status
      FROM orders
      WHERE id = ? AND pickup_code = ?
    `).bind(orderId, pickupCode).first();

    if (!order) return json({ error: '订单不存在' }, 404);
    return json({ order });
  } catch (error) {
    console.error(error);
    return json({ error: '读取支付状态失败' }, 500);
  }
}

export async function handleAlipayNotification({ request, env }) {
  if (!env.DB || !env.ALIPAY_APP_ID || !env.ALIPAY_PUBLIC_KEY) {
    console.error('Alipay notification received before bindings were configured');
    return notifyResponse(false, 503);
  }

  try {
    const form = await request.formData();
    const params = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
    const verified = await verifyAlipayNotification(params, env.ALIPAY_PUBLIC_KEY);
    if (!verified) return notifyResponse(false, 400);
    if (params.app_id !== env.ALIPAY_APP_ID) return notifyResponse(false, 400);
    if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)) {
      return notifyResponse(true);
    }

    const totalCents = centsFromAlipayAmount(params.total_amount);
    if (totalCents === null || !params.out_trade_no || !params.trade_no) {
      return notifyResponse(false, 400);
    }

    const order = await env.DB.prepare(`
      SELECT id, total_cents, payment_status, alipay_trade_no
      FROM orders
      WHERE alipay_out_trade_no = ?
    `).bind(params.out_trade_no).first();

    if (!order || Number(order.total_cents) !== totalCents) return notifyResponse(false, 400);
    if (order.alipay_trade_no && order.alipay_trade_no !== params.trade_no) {
      return notifyResponse(false, 400);
    }

    await env.DB.prepare(`
      UPDATE orders
      SET payment_status = 'paid',
          alipay_trade_no = COALESCE(alipay_trade_no, ?),
          paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(params.trade_no, order.id).run();

    return notifyResponse(true);
  } catch (error) {
    console.error('Failed to process Alipay notification', error);
    return notifyResponse(false, 500);
  }
}
