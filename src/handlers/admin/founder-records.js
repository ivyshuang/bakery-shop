const categories = ['PREPARATION', 'EXPERIMENT', 'REGISTRATION', 'OFFICE', 'OTHER'];
const statuses = ['PENDING_CONVERSION', 'COMPANY_CONFIRMED', 'PERSONAL', 'REIMBURSED'];
const filePattern = /^data:(image\/(?:jpeg|png|webp)|application\/pdf|application\/ofd|application\/xml|text\/xml);base64,([A-Za-z0-9+/=]+)$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
function text(body, key, max, required = false) { const value = body[key] ?? ''; if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error(`字段 ${key} 不能为空或超过长度限制`); return value.trim(); }
function date(body, key) { const value = text(body, key, 10, true); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error(`${key} 日期不正确`); return value; }
function cents(body, key, optional = false) { const value = body[key]; if (optional && (value === undefined || value === '')) return 0; if (!Number.isSafeInteger(value) || value < 0 || value > 1e12) throw new Error(`${key} 金额不正确`); return value; }
async function storeFile(env, data, name) {
  if (!env.PROCUREMENT_FILES) throw new Error('文件存储未配置，请先配置 R2');
  const match = String(data || '').match(filePattern); if (!match) throw new Error('凭证文件格式不支持');
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); if (bytes.length > 10 * 1024 * 1024) throw new Error('凭证文件不能超过10 MB');
  const key = `founder/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  await env.PROCUREMENT_FILES.put(key, bytes, { httpMetadata: { contentType: match[1], contentDisposition: `attachment; filename="${String(name).replace(/[^\w.-]+/g, '_')}"` } });
  return { key, type: match[1], size: bytes.length, hash };
}
function validate(body) { const gross = cents(body, 'gross_paid_cents'); const refunded = cents(body, 'refunded_cents', true); if (refunded > gross) throw new Error('退款金额不能超过原始付款金额'); const category = text(body, 'category', 30, true); if (!categories.includes(category)) throw new Error('支出类别不正确'); const status = text(body, 'status', 30, true); if (!statuses.includes(status)) throw new Error('支出状态不正确'); const decisionId = body.decision_id === '' || body.decision_id == null ? null : Number(body.decision_id); if (decisionId !== null && (!Number.isSafeInteger(decisionId) || decisionId < 1)) throw new Error('关联决策不正确'); return [date(body, 'spent_on'), text(body, 'title', 160, true), category, gross, refunded, text(body, 'payment_method', 40), text(body, 'payee', 160), text(body, 'payment_reference', 160), text(body, 'refund_reference', 160), text(body, 'purpose', 1000), text(body, 'outcome', 1000), text(body, 'disposal', 1000), 1, status, decisionId, text(body, 'evidence_note', 2000)]; }
const decorate = (row, files = []) => ({ ...row, net_amount_cents: Number(row.gross_paid_cents) - Number(row.refunded_cents), files });
async function listFiles(env, expenseId, all = false) { const { results } = await env.DB.prepare(`SELECT ${all ? '*' : 'id, expense_id, file_name, file_type, file_size, file_hash, source_receipt_file_id, created_at'} FROM founder_expense_files WHERE expense_id = ? ORDER BY id`).bind(expenseId).all(); return results || []; }

async function addFile({ request, env, id }) {
  if (request.method !== 'POST') return json({ error: '请求方法不支持' }, 405);
  const expenseId = Number(id); if (!Number.isSafeInteger(expenseId) || expenseId < 1) return json({ error: '记录编号不正确' }, 400);
  if (!await env.DB.prepare('SELECT id FROM founder_expenses WHERE id = ?').bind(expenseId).first()) return json({ error: '记录不存在' }, 404);
  let body, stored;
  try {
    body = await request.json(); const name = text(body, 'file_name', 200, true); stored = await storeFile(env, body.file_data, name);
    const result = await env.DB.prepare('INSERT INTO founder_expense_files (expense_id, file_key, file_name, file_type, file_size, file_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(expenseId, stored.key, name, stored.type, stored.size, stored.hash).run();
    return json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error) { if (stored?.key && env.PROCUREMENT_FILES?.delete) await env.PROCUREMENT_FILES.delete(stored.key).catch(() => {}); return json({ error: error.message || '上传失败' }, 400); }
}

async function handleFile({ request, env, id, fileId }) {
  if (!fileId) return addFile({ request, env, id });
  const row = await env.DB.prepare('SELECT * FROM founder_expense_files WHERE id = ? AND expense_id = ?').bind(Number(fileId), Number(id)).first();
  if (!row) return json({ error: '凭证文件不存在' }, 404);
  if (request.method === 'GET') {
    const object = await env.PROCUREMENT_FILES?.get(row.file_key); if (!object) return json({ error: '凭证文件不存在' }, 404);
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || row.file_type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`, 'Cache-Control': 'no-store' } });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM founder_expense_files WHERE id = ? AND expense_id = ?').bind(Number(fileId), Number(id)).run();
    if (!row.source_receipt_file_id && env.PROCUREMENT_FILES?.delete) await env.PROCUREMENT_FILES.delete(row.file_key);
    return json({ success: true });
  }
  return json({ error: '请求方法不支持' }, 405);
}

async function quickImport(request, env) {
  let body, stored, expenseId;
  try {
    body = await request.json(); const name = text(body, 'file_name', 200, true); if (!name.toLowerCase().endsWith('.pdf')) throw new Error('请选择订单 PDF');
    stored = await storeFile(env, body.file_data, name); if (stored.type !== 'application/pdf') throw new Error('请选择订单 PDF');
    const today = new Date().toISOString().slice(0, 10);
    const title = name.replace(/\.pdf$/i, '').slice(0, 160) || '订单';
    const result = await env.DB.prepare("INSERT INTO founder_expenses (spent_on, title, category, gross_paid_cents, status, evidence_note) VALUES (?, ?, 'PREPARATION', 0, 'PENDING_CONVERSION', '由订单 PDF 快速创建，金额等信息可稍后补充')").bind(today, title).run();
    expenseId = result.meta.last_row_id;
    await env.DB.prepare('INSERT INTO founder_expense_files (expense_id, file_key, file_name, file_type, file_size, file_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(expenseId, stored.key, name, stored.type, stored.size, stored.hash).run();
    return json({ success: true, id: expenseId }, 201);
  } catch (error) { if (expenseId) await env.DB.prepare('DELETE FROM founder_expenses WHERE id = ?').bind(expenseId).run().catch(() => {}); if (stored?.key && env.PROCUREMENT_FILES?.delete) await env.PROCUREMENT_FILES.delete(stored.key).catch(() => {}); return json({ error: error.message || '导入失败' }, 400); }
}

export async function founderRecords({ request, env, id, files, fileId, importOrder }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  if (importOrder) return request.method === 'POST' ? quickImport(request, env) : json({ error: '请求方法不支持' }, 405);
  if (files) return handleFile({ request, env, id, fileId });
  const method = request.method.toUpperCase(); const allowed = id ? ['GET', 'PATCH', 'DELETE'] : ['GET', 'POST']; if (!allowed.includes(method)) return json({ error: '请求方法不支持' }, 405);
  if (id && (!Number.isSafeInteger(Number(id)) || Number(id) < 1)) return json({ error: '记录编号不正确' }, 400);
  if (method === 'GET') {
    if (id) { const row = await env.DB.prepare('SELECT * FROM founder_expenses WHERE id = ?').bind(Number(id)).first(); return row ? json({ record: decorate(row, await listFiles(env, Number(id))) }) : json({ error: '记录不存在' }, 404); }
    const { results } = await env.DB.prepare('SELECT * FROM founder_expenses ORDER BY spent_on DESC, id DESC').all(); const { results: fileRows } = await env.DB.prepare('SELECT id, expense_id, file_name, file_type, file_size, file_hash, source_receipt_file_id, created_at FROM founder_expense_files ORDER BY id').all(); const grouped = new Map(); for (const file of fileRows || []) { if (!grouped.has(file.expense_id)) grouped.set(file.expense_id, []); grouped.get(file.expense_id).push(file); } return json({ records: (results || []).map(row => decorate(row, grouped.get(row.id) || [])) });
  }
  if (method === 'DELETE') { const fileRows = await listFiles(env, Number(id), true); await env.DB.prepare("UPDATE receipt_emails SET status = 'PENDING', linked_expense_id = NULL WHERE linked_expense_id = ?").bind(Number(id)).run(); const result = await env.DB.prepare('DELETE FROM founder_expenses WHERE id = ?').bind(Number(id)).run(); if (!result.meta?.changes) return json({ error: '记录不存在' }, 404); if (env.PROCUREMENT_FILES?.delete) await Promise.all(fileRows.filter(file => !file.source_receipt_file_id).map(file => env.PROCUREMENT_FILES.delete(file.file_key).catch(() => {}))); return json({ success: true }); }
  let body, values; try { body = await request.json(); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求内容不正确'); values = validate(body); } catch (error) { return json({ error: error.message || '请求内容不正确' }, 400); }
  const columns = ['spent_on', 'title', 'category', 'gross_paid_cents', 'refunded_cents', 'payment_method', 'payee', 'payment_reference', 'refund_reference', 'purpose', 'outcome', 'disposal', 'business_relevance', 'status', 'decision_id', 'evidence_note'];
  const statement = method === 'POST' ? env.DB.prepare(`INSERT INTO founder_expenses (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...values) : env.DB.prepare(`UPDATE founder_expenses SET ${columns.map(column => `${column} = ?`).join(',')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...values, Number(id));
  const result = await statement.run(); if (method === 'PATCH' && !result.meta?.changes) return json({ error: '记录不存在' }, 404); return json({ success: true, id: id ? Number(id) : result.meta.last_row_id }, method === 'POST' ? 201 : 200);
}
