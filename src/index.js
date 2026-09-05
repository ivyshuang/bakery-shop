import { getProducts } from './handlers/products.js';
import { createOrder } from './handlers/order.js';
import { getAdminProducts, createProduct } from './handlers/admin/products.js';
import { updateProduct } from './handlers/admin/product.js';
import { getOrders } from './handlers/admin/orders.js';
import { updateOrder } from './handlers/admin/order.js';
import { getOrderPaymentStatus, handleAlipayNotification } from './handlers/payment.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function methodNotAllowed(allowed) {
  return json({ error: '请求方法不支持' }, 405, { Allow: allowed.join(', ') });
}

function authorizeAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN 尚未配置' }, 503);
  const providedToken = request.headers.get('X-Admin-Token') || '';
  if (providedToken !== env.ADMIN_TOKEN) return json({ error: '未授权' }, 401);
  return null;
}

async function routeApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (path.startsWith('/api/admin/')) {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
  }

  if (path === '/api/products') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return getProducts({ request, env });
  }

  if (path === '/api/order') {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    return createOrder({ request, env });
  }

  if (path === '/api/payment/alipay/notify') {
    if (method !== 'POST') return methodNotAllowed(['POST']);
    return handleAlipayNotification({ request, env });
  }

  const orderStatusMatch = path.match(/^\/api\/order\/(\d+)\/status$/);
  if (orderStatusMatch) {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return getOrderPaymentStatus({ request, env, params: { id: orderStatusMatch[1] } });
  }

  if (path === '/api/admin/products') {
    if (method === 'GET') return getAdminProducts({ request, env });
    if (method === 'POST') return createProduct({ request, env });
    return methodNotAllowed(['GET', 'POST']);
  }

  if (path === '/api/admin/orders') {
    if (method !== 'GET') return methodNotAllowed(['GET']);
    return getOrders({ request, env });
  }

  const productMatch = path.match(/^\/api\/admin\/product\/([^/]+)$/);
  if (productMatch) {
    if (method !== 'PATCH') return methodNotAllowed(['PATCH']);
    return updateProduct({ request, env, params: { id: productMatch[1] } });
  }

  const orderMatch = path.match(/^\/api\/admin\/order\/([^/]+)$/);
  if (orderMatch) {
    if (method !== 'PATCH') return methodNotAllowed(['PATCH']);
    return updateOrder({ request, env, params: { id: orderMatch[1] } });
  }

  return json({ error: 'API 路由不存在' }, 404);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return await routeApi(request, env);
      }

      if (!env.ASSETS) return json({ error: '静态资源绑定 ASSETS 未配置' }, 500);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Unhandled Worker error', error);
      return json({ error: '服务器内部错误' }, 500);
    }
  }
};
