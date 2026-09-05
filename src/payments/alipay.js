const GATEWAY_URL = 'https://openapi.alipay.com/gateway.do';

function pemBytes(value, expectedLabel) {
  const normalized = String(value || '').replace(/\\n/g, '\n').trim();
  if (!normalized) throw new Error(`${expectedLabel} 未配置`);
  if (normalized.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('应用私钥必须使用 PKCS#8 格式（BEGIN PRIVATE KEY）');
  }

  const base64 = normalized
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error(`${expectedLabel} 格式不正确`);
  }
}

function bytesToBase64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

function base64ToBytes(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function canonicalizeAlipayParams(params, excluded = []) {
  const excludedKeys = new Set(excluded);
  return Object.entries(params)
    .filter(([key, value]) => !excludedKeys.has(key) && value !== '' && value !== undefined && value !== null)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export async function importAlipayPrivateKey(value) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemBytes(value, 'ALIPAY_APP_PRIVATE_KEY'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function importAlipayPublicKey(value) {
  return crypto.subtle.importKey(
    'spki',
    pemBytes(value, 'ALIPAY_PUBLIC_KEY'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function signAlipayParams(params, privateKey) {
  const data = new TextEncoder().encode(canonicalizeAlipayParams(params));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data);
  return bytesToBase64(signature);
}

export async function verifyAlipayNotification(params, publicKeyValue) {
  const signature = params.sign;
  if (!signature || params.sign_type !== 'RSA2') return false;

  try {
    const publicKey = await importAlipayPublicKey(publicKeyValue);
    const data = new TextEncoder().encode(canonicalizeAlipayParams(params, ['sign', 'sign_type']));
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64ToBytes(signature),
      data
    );
  } catch (error) {
    console.error('Alipay signature verification failed', error);
    return false;
  }
}

function shanghaiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

export function centsFromAlipayAmount(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value || ''));
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function assertAlipayConfig(env) {
  for (const name of ['ALIPAY_APP_ID', 'ALIPAY_APP_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY']) {
    if (!env[name]) throw new Error(`${name} 尚未配置`);
  }
}

export async function createAlipayWapUrl({ env, privateKey, order, requestUrl }) {
  assertAlipayConfig(env);
  const origin = new URL(env.PUBLIC_BASE_URL || requestUrl).origin;
  const params = {
    app_id: env.ALIPAY_APP_ID,
    method: 'alipay.trade.wap.pay',
    format: 'JSON',
    return_url: `${origin}/?payment=return&order_id=${order.id}`,
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: shanghaiTimestamp(),
    version: '1.0',
    notify_url: `${origin}/api/payment/alipay/notify`,
    biz_content: JSON.stringify({
      out_trade_no: order.outTradeNo,
      total_amount: (order.totalCents / 100).toFixed(2),
      subject: `今日烘焙订单 ${order.pickupCode}`,
      product_code: 'QUICK_WAP_PAY',
      timeout_express: '30m',
      quit_url: `${origin}/?payment=cancel&order_id=${order.id}`
    })
  };

  params.sign = await signAlipayParams(params, privateKey);
  const gateway = new URL(env.ALIPAY_GATEWAY_URL || GATEWAY_URL);
  gateway.search = new URLSearchParams(params).toString();
  return gateway.toString();
}
