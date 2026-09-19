const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function receiptInbox({ request, env, id, fileId, link }) {
  if (!env.DB) return json({ error: 'D1 binding DB 未配置' }, 500);
  const method = request.method.toUpperCase();
  if (!id) {
    if (method !== 'GET') return json({ error: '请求方法不支持' }, 405);
    const { results } = await env.DB.prepare(`SELECT e.*, x.title AS linked_expense_title FROM receipt_emails e LEFT JOIN founder_expenses x ON x.id = e.linked_expense_id ORDER BY e.received_at DESC, e.id DESC`).all();
    const { results: files } = await env.DB.prepare('SELECT id, email_id, file_name, file_type, file_size, file_hash FROM receipt_email_files ORDER BY id').all();
    const grouped = new Map();
    for (const file of files || []) { if (!grouped.has(file.email_id)) grouped.set(file.email_id, []); grouped.get(file.email_id).push(file); }
    return json({ records: (results || []).map(row => ({ ...row, files: grouped.get(row.id) || [] })) });
  }
  const emailId = Number(id);
  if (!Number.isSafeInteger(emailId) || emailId < 1) return json({ error: '邮件编号不正确' }, 400);
  if (fileId) {
    if (method !== 'GET') return json({ error: '请求方法不支持' }, 405);
    const row = await env.DB.prepare('SELECT * FROM receipt_email_files WHERE id = ? AND email_id = ?').bind(Number(fileId), emailId).first();
    if (!row || !env.PROCUREMENT_FILES) return json({ error: '附件不存在' }, 404);
    const object = await env.PROCUREMENT_FILES.get(row.file_key);
    if (!object) return json({ error: '附件不存在' }, 404);
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || row.file_type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (link) {
    if (method !== 'POST') return json({ error: '请求方法不支持' }, 405);
    let expenseId;
    try { const body = await request.json(); expenseId = Number(body.expense_id); if (!Number.isSafeInteger(expenseId) || expenseId < 1) throw new Error(); }
    catch { return json({ error: '请选择垫资记录' }, 400); }
    const email = await env.DB.prepare('SELECT * FROM receipt_emails WHERE id = ?').bind(emailId).first();
    if (!email) return json({ error: '邮件不存在' }, 404);
    if (email.status === 'LINKED') return json({ error: '这封邮件已经归档' }, 409);
    const expense = await env.DB.prepare('SELECT id FROM founder_expenses WHERE id = ?').bind(expenseId).first();
    if (!expense) return json({ error: '垫资记录不存在' }, 404);
    const { results: files } = await env.DB.prepare('SELECT * FROM receipt_email_files WHERE email_id = ? ORDER BY id').bind(emailId).all();
    if (!files?.length) return json({ error: '这封邮件没有附件' }, 400);
    for (const file of files) {
      await env.DB.prepare('INSERT OR IGNORE INTO founder_expense_files (expense_id, file_key, file_name, file_type, file_size, file_hash, source_receipt_file_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(expenseId, file.file_key, file.file_name, file.file_type, file.file_size, file.file_hash, file.id).run();
    }
    await env.DB.prepare("UPDATE receipt_emails SET status = 'LINKED', linked_expense_id = ? WHERE id = ?").bind(expenseId, emailId).run();
    return json({ success: true });
  }
  return json({ error: 'API 路由不存在' }, 404);
}
