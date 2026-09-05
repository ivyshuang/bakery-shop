const state = {
  products: [],
  quantities: new Map(),
  submitting: false
};

const $ = (selector) => document.querySelector(selector);
const money = (cents) => `¥${(Number(cents) / 100).toFixed(2)}`;
const pendingOrderKey = 'bakery_pending_order';

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
  $('#successMessage').textContent = message;
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
        status.textContent = '支付宝付款成功';
        status.classList.add('paid');
        $('#successTitle').textContent = '付款成功';
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

  status.textContent = '暂未收到支付宝付款通知';
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
    $('#productCount').textContent = '加载失败';
  }
}

function renderProducts() {
  const list = $('#productList');
  const template = $('#productTemplate');
  list.innerHTML = '';

  if (!state.products.length) {
    list.innerHTML = '<div class="empty">今天还没有上架商品</div>';
    $('#productCount').textContent = '0 款';
    return;
  }

  for (const product of state.products) {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.product');
    article.dataset.id = product.id;
    node.querySelector('.product-emoji').textContent = product.emoji || '🥐';
    node.querySelector('h3').textContent = product.name;
    node.querySelector('.product-copy p').textContent = product.description || '今日现烤';
    node.querySelector('.price').textContent = money(product.price_cents);

    node.querySelector('.minus').addEventListener('click', () => changeQty(product.id, -1));
    node.querySelector('.plus').addEventListener('click', () => changeQty(product.id, 1));
    list.appendChild(node);
  }

  $('#productCount').textContent = `${state.products.length} 款`;
  updateSummary();
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
  const button = $('#submitOrder');
  button.disabled = count === 0 || state.submitting;
  button.textContent = state.submitting ? '正在提交…' : count ? `提交订单 · ${count} 件` : '请选择商品';
}

async function submitOrder() {
  if (state.submitting) return;

  const name = $('#name').value.trim();
  const phone = $('#phone').value.trim();
  if (!name) return alert('请填写姓名');
  if (!phone) return alert('请填写手机号或微信号');

  const items = [...state.quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  if (!items.length) return;

  state.submitting = true;
  updateSummary();

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
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
    alert(error.message);
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
$('#closeSuccess').addEventListener('click', () => $('#successDialog').close());
$('#continuePayment').addEventListener('click', () => {
  const order = readPendingOrder();
  if (order?.payment_url) window.location.assign(order.payment_url);
});
loadProducts();
handlePaymentReturn();
