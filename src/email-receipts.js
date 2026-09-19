import PostalMime from 'postal-mime';

const bytesHash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

export async function receiveReceiptEmail(message, env) {
  if (!env.DB || !env.PROCUREMENT_FILES) throw new Error('收件归档需要 DB 和 PROCUREMENT_FILES 绑定');
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const rawHash = await bytesHash(raw);
  const messageId = String(parsed.messageId || message.headers.get('Message-ID') || `sha256:${rawHash}`).slice(0, 500);
  if (await env.DB.prepare('SELECT id FROM receipt_emails WHERE message_id = ?').bind(messageId).first()) return;
  const date = new Date().toISOString().slice(0, 10);
  const rawKey = `receipt-emails/${date}/${crypto.randomUUID()}.eml`;
  await env.PROCUREMENT_FILES.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } });
  const result = await env.DB.prepare('INSERT INTO receipt_emails (message_id, sender, recipient, subject, received_at, raw_key, raw_size) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(messageId, String(message.from || '').slice(0, 320), String(message.to || '').slice(0, 320), String(parsed.subject || '').slice(0, 500), parsed.date && Number.isFinite(Date.parse(parsed.date)) ? new Date(parsed.date).toISOString() : new Date().toISOString(), rawKey, raw.byteLength).run();
  const emailId = result.meta.last_row_id;
  for (let index = 0; index < (parsed.attachments || []).length; index++) {
    const attachment = parsed.attachments[index];
    const content = attachment.content instanceof Uint8Array ? attachment.content : new Uint8Array(attachment.content);
    const fileName = String(attachment.filename || `附件-${index + 1}`).slice(0, 240);
    const fileType = String(attachment.mimeType || 'application/octet-stream').slice(0, 120);
    const hash = await bytesHash(content);
    const key = `receipt-emails/${date}/${crypto.randomUUID()}`;
    await env.PROCUREMENT_FILES.put(key, content, { httpMetadata: { contentType: fileType, contentDisposition: `attachment; filename="${fileName.replace(/[^\w.-]+/g, '_')}"` } });
    await env.DB.prepare('INSERT INTO receipt_email_files (email_id, file_key, file_name, file_type, file_size, file_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(emailId, key, fileName, fileType, content.byteLength, hash).run();
  }
}
