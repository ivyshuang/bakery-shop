const state = {
  products: [],
  quantities: new Map(),
  submitting: false
};

const $ = (selector) => document.querySelector(selector);
const money = (cents) => `¥${(Number(cents) / 100).toFixed(2)}`;
const pendingOrderKey = 'bakery_pending_order';
const knownProductTranslations = new Map([
  ['海盐卷', 'Sea Salt Roll'],
  ['当天现烤，外脆内软', 'Baked fresh today, crisp outside and soft inside'],
  ['原味贝果', 'Plain Bagel'],
  ['低糖有嚼劲', 'Low in sugar with a chewy texture'],
  ['黄油曲奇', 'Butter Cookies'],
  ['酥香小份装', 'Small serving, crisp and buttery'],
  ['今日现烤', 'Freshly baked today']
]);

function setBilingual(element, chinese, english) {
  element.replaceChildren(document.createTextNode(chinese));
  if (!english) return;
  const caption = document.createElement('small');
  caption.className = 'en-caption';
  caption.lang = 'en';
  caption.dataset.noTranslate = '';
  caption.textContent = english;
  element.appendChild(caption);
}

async function addProductTranslations() {
  const texts = [...new Set(state.products.flatMap((product) => [product.name, product.description || '今日现烤']))];
  const missing = texts.filter((value) => /[\u3400-\u9fff]/u.test(value) && !knownProductTranslations.has(value));
  if (missing.length) {
    try {
      const translated = await window.storefrontTranslator.translate(missing);
      missing.forEach((value, index) => knownProductTranslations.set(value, translated[index]));
    } catch (error) {
      console.error('Product translation failed', error);
    }
  }
  for (const product of state.products) {
    const article = [...document.querySelectorAll('.product')].find((element) => element.dataset.id === String(product.id));
    if (!article) continue;
    setBilingual(article.querySelector('h3'), product.name, knownProductTranslations.get(product.name));
    const description = product.description || '今日现烤';
    setBilingual(article.querySelector('.product-copy p'), description, knownProductTranslations.get(description));
  }
}

function readPendingOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(pendingOrderKey) || 'null');
  } catch {
    return null;
  }
}

function showOrderDialog(order, message) {
  $('#pickupCode').textContent = order.pickup_code;
  $('#successTotal').textContent = money(order.total_cents);
  setBilingual($('#successMessage'), message, message === '支付尚未完成，你可以继续付款' ? 'Payment incomplete. You can continue paying.' : 'Save your pickup code below');
  const dialog = $('#successDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

async function refreshPaymentStatus(order) {
  const status = $('#paymentState');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const query = new URLSearchParams({ pickup_code: order.pickup_code });
      const res = await fetch(`/api/order/${order.order_id}/status?${query}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取支付状态失败');
      if (data.order.payment_status === 'paid') {
        setBilingual(status, '支付宝付款成功', 'Alipay payment successful');
        status.classList.add('paid');
        setBilingual($('#successTitle'), '付款成功', 'Payment successful');
        $('#continuePayment').hidden = true;
        sessionStorage.removeItem(pendingOrderKey);
        return;
      }
    } catch (error) {
      console.error(error);
      break;
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  setBilingual(status, '暂未收到支付宝付款通知', 'Waiting for Alipay confirmation');
  status.classList.remove('paid');
  $('#continuePayment').hidden = !order.payment_url;
}

async function handlePaymentReturn() {
  const payment = new URLSearchParams(location.search).get('payment');
  if (!['return', 'cancel'].includes(payment)) return;
  const order = readPendingOrder();
  if (!order) return;

  showOrderDialog(
    order,
    payment === 'cancel' ? '支付尚未完成，你可以继续付款' : '请保存下面的取餐码'
  );
  await refreshPaymentStatus(order);
  history.replaceState(null, '', location.pathname);
}

async function loadProducts() {
  const list = $('#productList');
  try {
    const res = await fetch('/api/products', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '商品加载失败');
    state.products = data.products || [];
    renderProducts();
  } catch (error) {
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    setBilingual($('#productCount'), '加载失败', 'Failed to load');
  }
}

function renderProducts() {
  const list = $('#productList');
  const template = $('#productTemplate');
  list.innerHTML = '';

  if (!state.products.length) {
    list.innerHTML = '<div class="empty">今天还没有上架商品 <small class="en-caption" lang="en" data-no-translate>No products available today</small></div>';
    setBilingual($('#productCount'), '0 款', '0 products');
    return;
  }

  for (const product of state.products) {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.product');
    article.dataset.id = product.id;
    const image = node.querySelector('.product-image img');
    if (product.image_url) {
      image.src = product.image_url;
      image.alt = product.name;
      image.hidden = false;
      image.addEventListener('error', () => { image.hidden = true; });
    }
    setBilingual(node.querySelector('h3'), product.name, knownProductTranslations.get(product.name));
    const description = product.description || '今日现烤';
    setBilingual(node.querySelector('.product-copy p'), description, knownProductTranslations.get(description));
    node.querySelector('.price').textContent = money(product.price_cents);

    node.querySelector('.minus').addEventListener('click', () => changeQty(product.id, -1));
    node.querySelector('.plus').addEventListener('click', () => changeQty(product.id, 1));
    list.appendChild(node);
  }

  setBilingual($('#productCount'), `${state.products.length} 款`, `${state.products.length} products`);
  updateSummary();
  addProductTranslations();
}

function changeQty(id, delta) {
  const current = state.quantities.get(id) || 0;
  const next = Math.max(0, Math.min(30, current + delta));
  if (next === 0) state.quantities.delete(id);
  else state.quantities.set(id, next);

  const article = document.querySelector(`.product[data-id="${id}"]`);
  if (article) {
    article.querySelector('.qty-value').textContent = String(next);
    article.classList.toggle('selected', next > 0);
  }
  updateSummary();
}

function updateSummary() {
  let total = 0;
  let count = 0;
  for (const product of state.products) {
    const qty = state.quantities.get(product.id) || 0;
    total += Number(product.price_cents) * qty;
    count += qty;
  }
  $('#total').textContent = money(total);
  renderOrderDetails(count);
  const button = $('#submitOrder');
  button.disabled = count === 0 || state.submitting;
  setBilingual(button, state.submitting ? '正在提交…' : count ? `提交订单 · ${count} 件` : '请选择商品',
    state.submitting ? 'Submitting…' : count ? `Place order · ${count} items` : 'Select items');
}

function renderOrderDetails(count) {
  const details = $('#orderDetails');
  const list = $('#orderDetailsList');
  const toggle = $('#orderSummaryToggle');
  list.innerHTML = '';
  setBilingual($('#orderDetailsCount'), `${count} 件`, `${count} items`);
  toggle.disabled = count === 0;

  for (const product of state.products) {
    const quantity = state.quantities.get(product.id) || 0;
    if (!quantity) continue;

    const row = document.createElement('div');
    row.className = 'order-detail-row';
    const imageBox = document.createElement('div');
    imageBox.className = 'order-detail-image';
    const imagePlaceholder = document.createElement('span');
    setBilingual(imagePlaceholder, '无图', 'No image');
    imageBox.appendChild(imagePlaceholder);
    if (product.image_url) {
      const image = document.createElement('img');
      image.src = product.image_url;
      image.alt = product.name;
      image.addEventListener('error', () => image.remove());
      imageBox.appendChild(image);
    }
    const name = document.createElement('span');
    setBilingual(name, product.name, knownProductTranslations.get(product.name));
    const qty = document.createElement('span');
    qty.className = 'detail-qty';
    qty.textContent = `× ${quantity}`;
    const subtotal = document.createElement('strong');
    subtotal.textContent = money(Number(product.price_cents) * quantity);
    row.append(imageBox, name, qty, subtotal);
    list.appendChild(row);
  }

  if (count === 0) {
    details.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
}

async function submitOrder() {
  if (state.submitting) return;

  const items = [...state.quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  if (!items.length) return;

  state.submitting = true;
  updateSummary();

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_slot: $('#pickupSlot').value.trim(),
        note: $('#note').value.trim(),
        items
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '下单失败');
    if (!data.payment_url) throw new Error('未获得支付宝支付地址');

    sessionStorage.setItem(pendingOrderKey, JSON.stringify({
      order_id: data.order_id,
      pickup_code: data.pickup_code,
      total_cents: data.total_cents,
      payment_url: data.payment_url
    }));

    state.quantities.clear();
    document.querySelectorAll('.qty-value').forEach((el) => el.textContent = '0');
    document.querySelectorAll('.product').forEach((el) => el.classList.remove('selected'));
    window.location.assign(data.payment_url);
  } catch (error) {
    await window.storefrontTranslator.alert(error.message);
  } finally {
    state.submitting = false;
    updateSummary();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[char]);
}

$('#submitOrder').addEventListener('click', submitOrder);
$('#orderSummaryToggle').addEventListener('click', () => {
  const details = $('#orderDetails');
  const expanded = $('#orderSummaryToggle').getAttribute('aria-expanded') === 'true';
  details.hidden = expanded;
  $('#orderSummaryToggle').setAttribute('aria-expanded', String(!expanded));
});
$('#closeSuccess').addEventListener('click', () => $('#successDialog').close());
$('#continuePayment').addEventListener('click', () => {
  const order = readPendingOrder();
  if (order?.payment_url) window.location.assign(order.payment_url);
});
loadProducts();
handlePaymentReturn();
