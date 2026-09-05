function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const configuredToken = context.env.ADMIN_TOKEN;
  if (!configuredToken) {
    return json({ error: 'ADMIN_TOKEN 尚未配置' }, 503);
  }

  const providedToken = context.request.headers.get('X-Admin-Token') || '';
  if (providedToken !== configuredToken) {
    return json({ error: '未授权' }, 401);
  }

  return context.next();
}
