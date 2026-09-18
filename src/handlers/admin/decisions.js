const statuses = ['ACTIVE', 'SUPERSEDED', 'ARCHIVED'];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

function text(body, key, max, required = false) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new Error(`字段 ${key} 不能为空或超过长度限制`);
  }
  return value.trim();
}

function validateDecision(body) {
  const title = text(body, 'title', 120, true);
  const decidedOn = text(body, 'decided_on', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decidedOn)
    || !Number.isFinite(Date.parse(decidedOn))
    || new Date(decidedOn).toISOString().slice(0, 10) !== decidedOn) {
    throw new Error('决定日期不正确');
  }
  const status = text(body, 'status', 20, true);
  if (!statuses.includes(status)) throw new Error('记录状态不正确');

  return [
    title,
    decidedOn,
    status,
    text(body, 'problem', 1000, true),
    text(body, 'experiment', 2000),
    text(body, 'outcome', 2000),
    text(body, 'decision', 2000, true),
    text(body, 'principle', 2000, true),
    text(body, 'scope', 1000)
  ];
}

export async function decisions({ request, env, id }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const method = request.method.toUpperCase();
  const allowed = id ? ['GET', 'PATCH', 'DELETE'] : ['GET', 'POST'];
  if (!allowed.includes(method)) {
    return new Response(JSON.stringify({ error: '请求方法不支持' }), {
      status: 405,
      headers: { Allow: allowed.join(', '), 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  if (id && (!Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
    return json({ error: '记录编号不正确' }, 400);
  }

  if (method === 'GET') {
    if (id) {
      const record = await env.DB.prepare('SELECT * FROM founder_decisions WHERE id = ?')
        .bind(Number(id)).first();
      return record ? json({ record }) : json({ error: '记录不存在' }, 404);
    }
    const { results } = await env.DB.prepare(
      'SELECT * FROM founder_decisions ORDER BY decided_on DESC, id DESC'
    ).all();
    return json({ records: results || [] });
  }

  if (method === 'DELETE') {
    const result = await env.DB.prepare('DELETE FROM founder_decisions WHERE id = ?')
      .bind(Number(id)).run();
    return result.meta?.changes
      ? json({ success: true })
      : json({ error: '记录不存在' }, 404);
  }

  let values;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求内容不正确');
    values = validateDecision(body);
  } catch (error) {
    return json({ error: error.message || '请求内容不正确' }, 400);
  }

  const columns = ['title', 'decided_on', 'status', 'problem', 'experiment', 'outcome', 'decision', 'principle', 'scope'];
  const statement = method === 'POST'
    ? env.DB.prepare(`INSERT INTO founder_decisions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...values)
    : env.DB.prepare(`UPDATE founder_decisions SET ${columns.map(column => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, Number(id));
  const result = await statement.run();
  if (method === 'PATCH' && !result.meta?.changes) return json({ error: '记录不存在' }, 404);
  return json({ success: true, id: id ? Number(id) : result.meta.last_row_id }, method === 'POST' ? 201 : 200);
}
