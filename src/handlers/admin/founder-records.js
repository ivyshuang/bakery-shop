const expenseCategories = ['PREPARATION', 'EXPERIMENT', 'REGISTRATION', 'OFFICE', 'OTHER'];
const expenseStatuses = ['PENDING_CONVERSION', 'COMPANY_CONFIRMED', 'PERSONAL', 'REIMBURSED'];
const assetStatuses = ['PERSONAL', 'TRANSFERRED', 'CONTRIBUTED', 'DISPOSED'];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

function text(body, key, max, required = false) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new Error(`字段 ${key} 不能为空或超过长度限制`);
  }
  return value.trim();
}

function date(body, key) {
  const value = text(body, key, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`${key} 日期不正确`);
  }
  return value;
}

function cents(body, key, required = true) {
  const value = body[key];
  if (!required && (value === undefined || value === '')) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e12) throw new Error(`${key} 金额不正确`);
  return value;
}

function booleanFlag(body, key) {
  const value = body[key];
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0' || value === undefined) return 0;
  throw new Error(`${key} 选项不正确`);
}

function validateExpense(body) {
  const gross = cents(body, 'gross_paid_cents');
  const refunded = cents(body, 'refunded_cents', false);
  if (refunded > gross) throw new Error('退款金额不能超过原始付款金额');
  const category = text(body, 'category', 30, true);
  if (!expenseCategories.includes(category)) throw new Error('支出类别不正确');
  const status = text(body, 'status', 30, true);
  if (!expenseStatuses.includes(status)) throw new Error('支出状态不正确');
  const decisionId = body.decision_id === '' || body.decision_id === null || body.decision_id === undefined ? null : Number(body.decision_id);
  if (decisionId !== null && (!Number.isSafeInteger(decisionId) || decisionId < 1)) throw new Error('关联决策不正确');
  return [date(body, 'spent_on'), text(body, 'title', 160, true), category, gross, refunded,
    text(body, 'payment_method', 40), text(body, 'payee', 160), text(body, 'payment_reference', 160),
    text(body, 'refund_reference', 160), text(body, 'purpose', 1000), text(body, 'outcome', 1000),
    text(body, 'disposal', 1000), booleanFlag(body, 'business_relevance'), status, decisionId,
    text(body, 'evidence_note', 2000)];
}

function validateAsset(body) {
  const status = text(body, 'status', 30, true);
  if (!assetStatuses.includes(status)) throw new Error('资产状态不正确');
  return [text(body, 'name', 160, true), date(body, 'acquired_on'), cents(body, 'amount_cents'),
    text(body, 'current_owner', 100, true), text(body, 'payment_method', 40), text(body, 'payment_reference', 160),
    text(body, 'intended_use', 1000), text(body, 'future_handling', 1000), status, text(body, 'evidence_note', 2000)];
}

function withNet(row) {
  if (!row) return row;
  return { ...row, net_amount_cents: Number(row.gross_paid_cents) - Number(row.refunded_cents) };
}

export async function founderRecords({ request, env, resource, id }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const table = resource === 'expenses' ? 'founder_expenses' : 'founder_assets';
  const method = request.method.toUpperCase();
  const allowed = id ? ['GET', 'PATCH', 'DELETE'] : ['GET', 'POST'];
  if (!allowed.includes(method)) return json({ error: '请求方法不支持' }, 405);
  if (id && (!Number.isSafeInteger(Number(id)) || Number(id) < 1)) return json({ error: '记录编号不正确' }, 400);

  if (method === 'GET') {
    if (id) {
      const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(Number(id)).first();
      return row ? json({ record: resource === 'expenses' ? withNet(row) : row }) : json({ error: '记录不存在' }, 404);
    }
    const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${resource === 'expenses' ? 'spent_on' : 'acquired_on'} DESC, id DESC`).all();
    return json({ records: (results || []).map(row => resource === 'expenses' ? withNet(row) : row) });
  }

  if (method === 'DELETE') {
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(Number(id)).run();
    return result.meta?.changes ? json({ success: true }) : json({ error: '记录不存在' }, 404);
  }

  let values;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求内容不正确');
    values = resource === 'expenses' ? validateExpense(body) : validateAsset(body);
  } catch (error) {
    return json({ error: error.message || '请求内容不正确' }, 400);
  }
  const columns = resource === 'expenses'
    ? ['spent_on', 'title', 'category', 'gross_paid_cents', 'refunded_cents', 'payment_method', 'payee', 'payment_reference', 'refund_reference', 'purpose', 'outcome', 'disposal', 'business_relevance', 'status', 'decision_id', 'evidence_note']
    : ['name', 'acquired_on', 'amount_cents', 'current_owner', 'payment_method', 'payment_reference', 'intended_use', 'future_handling', 'status', 'evidence_note'];
  const statement = method === 'POST'
    ? env.DB.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).bind(...values)
    : env.DB.prepare(`UPDATE ${table} SET ${columns.map(column => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, Number(id));
  const result = await statement.run();
  if (method === 'PATCH' && !result.meta?.changes) return json({ error: '记录不存在' }, 404);
  return json({ success: true, id: id ? Number(id) : result.meta.last_row_id }, method === 'POST' ? 201 : 200);
}
