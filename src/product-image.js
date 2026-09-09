export function parseImage(value) {
  if (value === '') return null;
  if (typeof value !== 'string' || value.length > 700000) throw new Error('图片过大，请选择较小的图片');
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('仅支持 JPG、PNG 或 WebP 图片');
  let bytes;
  try { bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)); }
  catch { throw new Error('图片数据不正确'); }
  const hex = Array.from(bytes.slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
  const valid = match[1] === 'jpeg' ? hex.startsWith('ffd8ff') : match[1] === 'png' ? hex.startsWith('89504e470d0a1a0a') : hex.startsWith('52494646') && hex.slice(16) === '57454250';
  if (!valid || bytes.length > 512000) throw new Error('图片格式不正确或超过 500 KB');
  return { bytes, type: `image/${match[1]}` };
}

export async function getProductImage({ env, params }) {
  if (!env.DB) return new Response('数据库未配置', { status: 500 });
  const product = await env.DB.prepare('SELECT image_data FROM products WHERE id = ?').bind(Number(params.id)).first();
  if (!product?.image_data) return new Response('暂无图片', { status: 404 });
  const image = parseImage(product.image_data);
  return new Response(image.bytes, { headers: {
    'Content-Type': image.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  } });
}
