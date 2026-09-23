const state = {
  products: [],
  quantities: new Map(),
  submitting: false,
  language: 'zh',
  productsLoaded: false,
  productError: '',
  paymentStatus: 'checking',
  paymentMessage: 'saveCode'
};

const $ = (selector) => document.querySelector(selector);
const money = (cents) => `¥${(Number(cents) / 100).toFixed(2)}`;
const pendingOrderKey = 'bakery_pending_order';
const languageKey = 'bakery_language';
const translations = {
  zh: {
    title: 'RO·今日烘焙 · 在线下单', description: '今日现烤，在线下单，到店自提。', brand: 'RO·今日烘焙',
    tagline: '少量现烤 · 售完即止 · 下单后凭取餐码自提', pickupNotice: '自提说明', paymentNotice: '提交订单后将跳转到支付宝，确认金额并完成付款。',
    todayMenu: '今天有什么', loading: '加载中…', loadFailed: '加载失败', noProducts: '今天还没有上架商品', productCount: (n) => `${n} 款`,
    pickupInfo: '取餐信息', requiredNote: '带 * 为必填', nameLabel: '姓名 *', namePlaceholder: '怎么称呼你',
    phoneLabel: '手机号 / 微信号 *', phonePlaceholder: '方便核对订单', pickupTimeLabel: '预计取餐时间', pickupTimePlaceholder: '例如：今天 18:30 左右',
    noteLabel: '备注', notePlaceholder: '例如：不要纸袋 / 口味备注', selectedItems: '已选商品', itemCount: (n) => `${n} 件`,
    totalHint: '合计 · 点击查看', chooseProduct: '请选择商品', submitting: '正在提交…', submit: (n) => `提交订单 · ${n} 件`,
    noImage: '暂无图片', noImageShort: '无图', freshToday: '今日现烤', decrease: '减少', increase: '增加',
    successTitle: '订单已提交', paidTitle: '付款成功', saveCode: '请保存下面的取餐码', paymentCancelled: '支付尚未完成，你可以继续付款',
    amountDue: '应付金额', checking: '正在确认支付结果…', paid: '支付宝付款成功', unpaid: '暂未收到支付宝付款通知',
    paymentTip: '支付结果以支付宝通知为准。取餐时请出示取餐码。', continuePayment: '继续支付宝付款', close: '知道了',
    nameRequired: '请填写姓名', phoneRequired: '请填写手机号或微信号', orderFailed: '下单失败', noPaymentUrl: '未获得支付宝支付地址',
    productLoadFailed: '商品加载失败', statusFailed: '读取支付状态失败'
  },
  en: {
    title: 'RO · Today’s Bake · Order Online', description: 'Freshly baked today. Order online and pick up in store.', brand: 'RO · Today’s Bake',
    tagline: 'Freshly baked in small batches · While supplies last · Pick up with your code', pickupNotice: 'Pickup information', paymentNotice: 'After placing your order, you will be redirected to Alipay to confirm the amount and pay.',
    todayMenu: 'Today’s menu', loading: 'Loading…', loadFailed: 'Could not load', noProducts: 'No products available today', productCount: (n) => `${n} items`,
    pickupInfo: 'Pickup details', requiredNote: '* Required', nameLabel: 'Name *', namePlaceholder: 'What should we call you?',
    phoneLabel: 'Phone / WeChat ID *', phonePlaceholder: 'So we can find your order', pickupTimeLabel: 'Estimated pickup time', pickupTimePlaceholder: 'e.g. Today around 18:30',
    noteLabel: 'Notes', notePlaceholder: 'e.g. No paper bag / flavor preferences', selectedItems: 'Selected items', itemCount: (n) => `${n} items`,
    totalHint: 'Total · Tap to review', chooseProduct: 'Choose an item', submitting: 'Placing order…', submit: (n) => `Place order · ${n} items`,
    noImage: 'No image', noImageShort: 'No image', freshToday: 'Freshly baked today', decrease: 'Decrease quantity', increase: 'Increase quantity',
    successTitle: 'Order placed', paidTitle: 'Payment successful', saveCode: 'Please save your pickup code below', paymentCancelled: 'Payment is incomplete. You can continue paying.',
    amountDue: 'Amount due', checking: 'Checking payment status…', paid: 'Alipay payment successful', unpaid: 'Alipay payment confirmation has not arrived yet',
    paymentTip: 'Alipay confirmation determines your payment status. Show your pickup code when collecting your order.', continuePayment: 'Continue to Alipay', close: 'Got it',
    nameRequired: 'Please enter your name', phoneRequired: 'Please enter your phone number or WeChat ID', orderFailed: 'Could not place order', noPaymentUrl: 'Alipay payment link unavailable',
    productLoadFailed: 'Could not load products', statusFailed: 'Could not read payment status'
  }
};
const t = (key, ...args) => {
  const value = translations[state.language][key];
  return typeof value === 'function' ? value(...args) : value;
};
function productText(product, field) {
  return (state.language === 'en' && product[`${field}_en`]) || product[field] || (field === 'description' ? t('freshToday') : '');
}
function setLanguage(language) {
  state.language = language;
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('description');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $('#orderDetails').setAttribute('aria-label', t('selectedItems'));
  const toggle = $('#languageToggle');
  toggle.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换为中文');
  toggle.querySelectorAll('[data-lang]').forEach((el) => el.classList.toggle('active', el.dataset.lang === language));
  $('#productCount').textContent = state.productError ? t('loadFailed') : state.productsLoaded ? t('productCount', state.products.length) : t('loading');
  if (state.productError) $('#productList').innerHTML = `<div class="empty">${escapeHtml(state.language === 'en' ? t('productLoadFailed') : state.productError)}</div>`;
  else if (state.productsLoaded) renderProducts();
  updateSummary();
  $('#successTitle').textContent = t(state.paymentStatus === 'paid' ? 'paidTitle' : 'successTitle');
  $('#successMessage').textContent = t(state.paymentMessage);
  $('#paymentState').textContent = t(state.paymentStatus);
}
try { if (localStorage.getItem(languageKey) === 'en') state.language = 'en'; } catch { /* Storage may be unavailable. */ }

function readPendingOrder() {
  try {
    return JSON.parse(sessionStorage.getItem(pendingOrderKey) || 'null');
  } catch {
    return null;
  }
}

function showOrderDialog(order, messageKey) {
  $('#pickupCode').textContent = order.pickup_code;
  $('#successTotal').textContent = money(order.total_cents);
  state.paymentMessage = messageKey;
  state.paymentStatus = 'checking';
  $('#successTitle').textContent = t('successTitle');
  $('#successMessage').textContent = t(messageKey);
  $('#paymentState').textContent = t('checking');
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
      if (!res.ok) throw new Error(data.error || t('statusFailed'));
      if (data.order.payment_status === 'paid') {
        state.paymentStatus = 'paid';
        status.textContent = t('paid');
        status.classList.add('paid');
        $('#successTitle').textContent = t('paidTitle');
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

  state.paymentStatus = 'unpaid';
  status.textContent = t('unpaid');
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
    payment === 'cancel' ? 'paymentCancelled' : 'saveCode'
  );
  await refreshPaymentStatus(order);
  history.replaceState(null, '', location.pathname);
}

async function loadProducts() {
  const list = $('#productList');
  try {
    const res = await fetch('/api/products', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('productLoadFailed'));
    state.products = data.products || [];
    state.productsLoaded = true;
    renderProducts();
  } catch (error) {
    state.productError = error.message;
    list.innerHTML = `<div class="empty">${escapeHtml(state.language === 'en' ? t('productLoadFailed') : error.message)}</div>`;
    $('#productCount').textContent = t('loadFailed');
  }
}

function renderProducts() {
  const list = $('#productList');
  const template = $('#productTemplate');
  list.innerHTML = '';

  if (!state.products.length) {
    list.innerHTML = `<div class="empty">${t('noProducts')}</div>`;
    $('#productCount').textContent = t('productCount', 0);
    return;
  }

  for (const product of state.products) {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.product');
    article.dataset.id = product.id;
    const image = node.querySelector('.product-image img');
    if (product.image_url) {
      image.src = product.image_url;
      image.alt = productText(product, 'name');
      image.hidden = false;
      image.addEventListener('error', () => { image.hidden = true; });
    }
    node.querySelector('.product-image span').textContent = t('noImage');
    node.querySelector('h3').textContent = productText(product, 'name');
    node.querySelector('.product-copy p').textContent = productText(product, 'description');
    node.querySelector('.price').textContent = money(product.price_cents);
    node.querySelector('.minus').setAttribute('aria-label', t('decrease'));
    node.querySelector('.plus').setAttribute('aria-label', t('increase'));
    node.querySelector('.qty-value').textContent = String(state.quantities.get(product.id) || 0);
    article.classList.toggle('selected', (state.quantities.get(product.id) || 0) > 0);

    node.querySelector('.minus').addEventListener('click', () => changeQty(product.id, -1));
    node.querySelector('.plus').addEventListener('click', () => changeQty(product.id, 1));
    list.appendChild(node);
  }

  $('#productCount').textContent = t('productCount', state.products.length);
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
  renderOrderDetails(count);
  const button = $('#submitOrder');
  button.disabled = count === 0 || state.submitting;
  button.textContent = state.submitting ? t('submitting') : count ? t('submit', count) : t('chooseProduct');
}

function renderOrderDetails(count) {
  const details = $('#orderDetails');
  const list = $('#orderDetailsList');
  const toggle = $('#orderSummaryToggle');
  list.innerHTML = '';
  $('#orderDetailsCount').textContent = t('itemCount', count);
  toggle.disabled = count === 0;

  for (const product of state.products) {
    const quantity = state.quantities.get(product.id) || 0;
    if (!quantity) continue;

    const row = document.createElement('div');
    row.className = 'order-detail-row';
    const imageBox = document.createElement('div');
    imageBox.className = 'order-detail-image';
    const imagePlaceholder = document.createElement('span');
    imagePlaceholder.textContent = t('noImageShort');
    imageBox.appendChild(imagePlaceholder);
    if (product.image_url) {
      const image = document.createElement('img');
      image.src = product.image_url;
      image.alt = productText(product, 'name');
      image.addEventListener('error', () => image.remove());
      imageBox.appendChild(image);
    }
    const name = document.createElement('span');
    name.textContent = productText(product, 'name');
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

  const name = $('#name').value.trim();
  const phone = $('#phone').value.trim();
  if (!name) return alert(t('nameRequired'));
  if (!phone) return alert(t('phoneRequired'));

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
    if (!res.ok) throw new Error(state.language === 'en' ? t('orderFailed') : data.error || t('orderFailed'));
    if (!data.payment_url) throw new Error(t('noPaymentUrl'));

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
$('#languageToggle').addEventListener('click', () => {
  const language = state.language === 'zh' ? 'en' : 'zh';
  setLanguage(language);
  try { localStorage.setItem(languageKey, language); } catch { /* Storage may be unavailable. */ }
});
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
setLanguage(state.language);
loadProducts();
handlePaymentReturn();
