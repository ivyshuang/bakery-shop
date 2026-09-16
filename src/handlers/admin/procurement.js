import { parseImage } from '../../product-image.js';

const categories = ['INGREDIENT', 'PACKAGING', 'CONSUMABLE', 'TOOL', 'EQUIPMENT', 'OTHER'];
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
function field(body, key, max, required = false) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new Error(`字段 ${key} 不能为空或超过长度限制`);
  }
  return value.trim();
}
export function validateSupply(body) {
  const values = [field(body, 'name', 100, true), field(body, 'specification', 200),
    field(body, 'category', 20, true), field(body, 'unit', 20, true), field(body, 'purchase_type', 20, true)];
  if (!categories.includes(values[2])) throw new Error('请选择物品分类');
  if (!['ONE_TIME', 'RECURRING'].includes(values[4])) throw new Error('请选择采购类型');
  return values;
}
export function validatePurchase(body) {
  if (!Number.isSafeInteger(body.supply_id) || body.supply_id < 1) throw new Error('请选择物品');
  if (typeof body.quantity !== 'number' || !Number.isFinite(body.quantity) || body.quantity <= 0 || body.quantity > 1e9) throw new Error('采购数量必须大于零且不超过十亿');
  if (!Number.isSafeInteger(body.amount_cents) || body.amount_cents < 0 || body.amount_cents > 1e12) throw new Error('实付金额不正确');
  const platform = field(body, 'platform', 60, true);
  const shop = field(body, 'shop', 100, true);
  const link = field(body, 'product_url', 2000);
  if (link) {
    let url;
    try { url = new URL(link); } catch { throw new Error('商品链接不正确'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('商品链接仅支持 http 或 https');
  }
  const order = field(body, 'order_number', 100);
  const date = field(body, 'purchased_on', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('购买日期不正确');
  if (body.image_data !== undefined) parseImage(body.image_data);
  return [body.supply_id, body.quantity, body.amount_cents, platform, shop, link, order, date];
}

export async function procurement({ request, env, resource, id, image }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const method = request.method;
  const allowed = image ? ['GET'] : id ? ['GET', 'PATCH'] : ['GET', 'POST'];
  if (!allowed.includes(method)) return new Response(JSON.stringify({ error: '请求方法不支持' }), {
    status: 405, headers: { Allow: allowed.join(', '), 'Content-Type': 'application/json' }
  });
  if (id && (!Number.isSafeInteger(Number(id)) || Number(id) < 1)) return json({ error: '记录编号不正确' }, 400);
  const table = resource === 'supplies' ? 'supplies' : 'purchase_records';
  if (method === 'GET') {
    if (image) {
      const row = await env.DB.prepare('SELECT image_data FROM purchase_records WHERE id = ?').bind(Number(id)).first();
      if (!row?.image_data) return json({ error: '暂无截图' }, 404);
      const parsed = parseImage(row.image_data);
      return new Response(parsed.bytes, { headers: { 'Content-Type': parsed.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const select = resource === 'supplies' ? 'SELECT * FROM supplies' : `SELECT p.id, p.supply_id, p.quantity, p.amount_cents, p.platform, p.shop, p.product_url,
      p.order_number, p.purchased_on, p.image_data != '' AS has_image, s.name, s.specification, s.unit, s.purchase_type
      FROM purchase_records p JOIN supplies s ON s.id = p.supply_id`;
    if (id) {
      const row = await env.DB.prepare(`${select} WHERE ${resource === 'supplies' ? 'id' : 'p.id'} = ?`).bind(Number(id)).first();
      return row ? json({ record: row }) : json({ error: '记录不存在' }, 404);
    }
    const { results } = await env.DB.prepare(`${select} ORDER BY ${resource === 'supplies' ? 'id DESC' : 'p.purchased_on DESC, p.id DESC'}`).all();
    return json({ records: results || [] });
  }
  let body, values;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求内容不正确');
    values = resource === 'supplies' ? validateSupply(body) : validatePurchase(body);
  } catch (error) { return json({ error: error.message || '请求内容不正确' }, 400); }
  if (resource === 'purchases') {
    const supply = await env.DB.prepare('SELECT id FROM supplies WHERE id = ?').bind(body.supply_id).first();
    if (!supply) return json({ error: '物品不存在，请重新选择' }, 400);
  }
  if (resource === 'supplies' && id) {
    // A unit change would silently reinterpret historical quantities.
    const old = await env.DB.prepare('SELECT unit FROM supplies WHERE id = ?').bind(Number(id)).first();
    if (!old) return json({ error: '记录不存在' }, 404);
    if (old.unit !== values[3]) {
      const used = await env.DB.prepare('SELECT id FROM purchase_records WHERE supply_id = ? LIMIT 1').bind(Number(id)).first();
      if (used) return json({ error: '已有采购记录的物品不能修改单位，请为新单位新建物品' }, 400);
    }
  }
  const columns = resource === 'supplies'
    ? ['name', 'specification', 'category', 'unit', 'purchase_type']
    : ['supply_id', 'quantity', 'amount_cents', 'platform', 'shop', 'product_url', 'order_number', 'purchased_on'];
  if (resource === 'purchases' && (method === 'POST' || body.image_data !== undefined)) {
    columns.push('image_data'); values.push(body.image_data ?? '');
  }
  const statement = method === 'POST'
    ? env.DB.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...values)
    : env.DB.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(',')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, Number(id));
  const result = await statement.run();
  if (method === 'PATCH' && !result.meta?.changes) return json({ error: '记录不存在' }, 404);
  return json({ success: true, id: id ? Number(id) : result.meta.last_row_id }, method === 'POST' ? 201 : 200);
}
