import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import {
  canonicalizeAlipayParams,
  centsFromAlipayAmount,
  importAlipayPrivateKey,
  signAlipayParams
} from '../src/payments/alipay.js';

function toPem(label, value) {
  const base64 = Buffer.from(value).toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

async function createTestKeys() {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  }, true, ['sign', 'verify']);
  const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const publicKey = await crypto.subtle.exportKey('spki', pair.publicKey);
  return {
    pair,
    privatePem: toPem('PRIVATE KEY', privateKey),
    publicPem: toPem('PUBLIC KEY', publicKey)
  };
}

function bytesToBase64(value) {
  return Buffer.from(value).toString('base64');
}

test('Alipay parameters are sorted and empty values are omitted', () => {
  assert.equal(
    canonicalizeAlipayParams({ z: 'last', a: 'first', empty: '', zero: 0 }),
    'a=first&z=last&zero=0'
  );
});

test('Alipay decimal amounts are converted to cents without floats', () => {
  assert.equal(centsFromAlipayAmount('12'), 1200);
  assert.equal(centsFromAlipayAmount('12.3'), 1230);
  assert.equal(centsFromAlipayAmount('12.34'), 1234);
  assert.equal(centsFromAlipayAmount('12.345'), null);
});

test('WAP request parameters receive a valid RSA2 signature', async () => {
  const keys = await createTestKeys();
  const imported = await importAlipayPrivateKey(keys.privatePem);
  const params = { app_id: '2026000000000000', method: 'alipay.trade.wap.pay', sign_type: 'RSA2' };
  const signature = await signAlipayParams(params, imported);
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    keys.pair.publicKey,
    Buffer.from(signature, 'base64'),
    new TextEncoder().encode(canonicalizeAlipayParams(params))
  );
  assert.equal(verified, true);
});

test('creating an order returns an amount-bound Alipay WAP URL', async () => {
  const keys = await createTestKeys();
  const db = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          if (sql.includes('FROM products')) return { id: 1, name: '海盐卷', price_cents: 600 };
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO orders')) return { meta: { last_row_id: 9 } };
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    },
    async batch() {
      return [];
    }
  };

  const response = await worker.fetch(new Request('https://shop.example/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '测试顾客',
      phone: '13800000000',
      items: [{ product_id: 1, quantity: 2 }]
    })
  }), {
    DB: db,
    ALIPAY_APP_ID: '2026000000000000',
    ALIPAY_APP_PRIVATE_KEY: keys.privatePem,
    ALIPAY_PUBLIC_KEY: keys.publicPem
  });

  assert.equal(response.status, 201);
  const result = await response.json();
  const paymentUrl = new URL(result.payment_url);
  const content = JSON.parse(paymentUrl.searchParams.get('biz_content'));
  assert.equal(paymentUrl.origin, 'https://openapi.alipay.com');
  assert.equal(paymentUrl.searchParams.get('method'), 'alipay.trade.wap.pay');
  assert.equal(content.total_amount, '12.00');
  assert.equal(content.product_code, 'QUICK_WAP_PAY');
  assert.match(content.out_trade_no, /^BAKERY/);
  assert.ok(paymentUrl.searchParams.get('sign'));
});

test('a valid Alipay notification marks the matching order paid', async () => {
  const keys = await createTestKeys();
  const params = {
    app_id: '2026000000000000',
    out_trade_no: 'BAKERY123',
    trade_no: '2026090500001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '12.00',
    sign_type: 'RSA2'
  };
  const signedContent = canonicalizeAlipayParams(params, ['sign_type']);
  params.sign = bytesToBase64(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.pair.privateKey,
    new TextEncoder().encode(signedContent)
  ));

  let updatedWith;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              assert.equal(values[0], 'BAKERY123');
              return { id: 7, total_cents: 1200, payment_status: 'pending', alipay_trade_no: null };
            },
            async run() {
              updatedWith = values;
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };

  const response = await worker.fetch(new Request('https://bakery.example/api/payment/alipay/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  }), {
    DB: db,
    ALIPAY_APP_ID: params.app_id,
    ALIPAY_PUBLIC_KEY: keys.publicPem
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'success');
  assert.deepEqual(updatedWith, ['2026090500001', 7]);

  const tampered = { ...params, total_amount: '0.01' };
  const rejected = await worker.fetch(new Request('https://bakery.example/api/payment/alipay/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tampered)
  }), {
    DB: db,
    ALIPAY_APP_ID: params.app_id,
    ALIPAY_PUBLIC_KEY: keys.publicPem
  });
  assert.equal(rejected.status, 400);
  assert.equal(await rejected.text(), 'failure');
});
