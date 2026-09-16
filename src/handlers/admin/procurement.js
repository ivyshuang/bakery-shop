import { parseImage } from '../../product-image.js';

const categories = ['INGREDIENT', 'PACKAGING', 'CONSUMABLE', 'TOOL', 'EQUIPMENT', 'OTHER'];
const categoryAliases = { '原料': 'INGREDIENT', '包装耗材': 'PACKAGING', '日常耗材': 'CONSUMABLE', '工具': 'TOOL', '设备': 'EQUIPMENT', '其他': 'OTHER' };
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
    categoryAliases[field(body, 'category', 20, true)] || field(body, 'category', 20, true), field(body, 'unit', 20, true)];
  if (!categories.includes(values[2])) throw new Error('请选择物品分类');
  if (body.purchase_type && !['ONE_TIME', 'RECURRING'].includes(body.purchase_type)) throw new Error('请选择采购类型');
  return values;
}
export function validatePurchase(body, allowLargeFile = false) {
  if (!body.purchase_type) body.purchase_type = 'RECURRING';
  if (!['ONE_TIME', 'RECURRING'].includes(body.purchase_type)) throw new Error('请选择采购类型');
  if (body.purchase_type === 'RECURRING' && (!Number.isSafeInteger(body.supply_id) || body.supply_id < 1)) throw new Error('请选择持续采购物品');
  if (body.purchase_type === 'ONE_TIME' && body.supply_id != null) throw new Error('一次性采购不能关联物品清单');
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
  if (body.image_data !== undefined && body.image_data !== '' && !String(body.image_data).startsWith('data:application/pdf;') && !allowLargeFile) parseImage(body.image_data);
  const itemName = field(body, 'item_name', 100);
  const specification = field(body, 'specification', 200);
  const category = categoryAliases[field(body, 'category', 20)] || field(body, 'category', 20);
  const unit = field(body, 'unit', 20);
  if (category && !categories.includes(category)) throw new Error('请选择物品分类');
  return [body.supply_id ?? null, body.purchase_type, itemName, specification, category, unit, body.quantity, body.amount_cents, platform, shop, link, order, date];
}

async function storeR2File(env, data, name = '') {
  if (!data) return null;
  if (!env.PROCUREMENT_FILES) return null;
  const match = String(data).match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('文件格式不支持');
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB');
  const key = `procurement/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  await env.PROCUREMENT_FILES.put(key, bytes, { httpMetadata: { contentType: match[1], contentDisposition: `inline; filename="${String(name || '凭证').replace(/[^\w.-]+/g, '_')}"` } });
  return { key, type: match[1], size: bytes.length, hash };
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
      const row = await env.DB.prepare('SELECT image_data, file_key FROM purchase_records WHERE id = ?').bind(Number(id)).first();
      if (row?.file_key && env.PROCUREMENT_FILES) { const object = await env.PROCUREMENT_FILES.get(row.file_key); if (!object) return json({ error: '文件不存在' }, 404); return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store' } }); }
      if (!row?.image_data) return json({ error: '暂无截图' }, 404);
      const parsed = parseImage(row.image_data);
      return new Response(parsed.bytes, { headers: { 'Content-Type': parsed.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const select = resource === 'supplies' ? 'SELECT * FROM supplies' : `SELECT p.id, p.supply_id, p.purchase_type, p.item_name AS name, p.specification, p.category, p.unit, p.quantity, p.amount_cents, p.platform, p.shop, p.product_url,
      p.order_number, p.purchased_on, (p.image_data != '' OR p.file_key != '') AS has_image FROM purchase_records p`;
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
    values = resource === 'supplies' ? validateSupply(body) : validatePurchase(body, Boolean(env.PROCUREMENT_FILES));
  } catch (error) { return json({ error: error.message || '请求内容不正确' }, 400); }
  if (resource === 'purchases' && body.purchase_type === 'RECURRING') {
    const supply = await env.DB.prepare('SELECT id FROM supplies WHERE id = ?').bind(body.supply_id).first();
    if (!supply) return json({ error: '物品不存在，请重新选择' }, 400);
    if (!body.item_name || !body.category || !body.unit) {
      const item = await env.DB.prepare('SELECT name, specification, category, unit FROM supplies WHERE id = ?').bind(body.supply_id).first();
      values[2] = item.name; values[3] = item.specification; values[4] = item.category; values[5] = item.unit;
    }
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
    ? ['name', 'specification', 'category', 'unit']
    : ['supply_id', 'purchase_type', 'item_name', 'specification', 'category', 'unit', 'quantity', 'amount_cents', 'platform', 'shop', 'product_url', 'order_number', 'purchased_on'];
  if (resource === 'purchases' && (method === 'POST' || body.image_data !== undefined)) {
    columns.push('image_data'); values.push(env.PROCUREMENT_FILES ? '' : (body.image_data ?? ''));
    const stored = await storeR2File(env, body.image_data, body.file_name);
    if (stored) { columns.push('file_key', 'file_name', 'file_type', 'file_size', 'file_hash'); values.push(stored.key, field(body, 'file_name', 200), stored.type, stored.size, stored.hash); }
  }
  const statement = method === 'POST'
    ? env.DB.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...values)
    : env.DB.prepare(`UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(',')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, Number(id));
  const result = await statement.run();
  if (method === 'PATCH' && !result.meta?.changes) return json({ error: '记录不存在' }, 404);
  return json({ success: true, id: id ? Number(id) : result.meta.last_row_id }, method === 'POST' ? 201 : 200);
}
