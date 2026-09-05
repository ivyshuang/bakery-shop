const $ = (selector) => document.querySelector(selector);
const money = (cents) => `¥${(Number(cents) / 100).toFixed(2)}`;
let token = sessionStorage.getItem('bakery_admin_token') || '';
let ordersCache = [];

function headers(extra = {}) {
  return { 'X-Admin-Token': token, ...extra };
}

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: headers(options.headers || {}) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    sessionStorage.removeItem('bakery_admin_token');
    token = '';
    showLogin();
    throw new Error('后台口令不正确');
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function showLogin() {
  $('#loginCard').hidden = false;
  $('#adminApp').hidden = true;
}

function showApp() {
  $('#loginCard').hidden = true;
  $('#adminApp').hidden = false;
}

async function enterAdmin() {
  token = $('#tokenInput').value.trim();
  if (!token) return;
  try {
    await api('/api/admin/orders');
    sessionStorage.setItem('bakery_admin_token', token);
    showApp();
    await Promise.all([loadOrders(), loadProducts()]);
  } catch (error) {
    alert(error.message);
  }
}

async function loadOrders() {
  try {
    const params = new URLSearchParams();
    const q = $('#search').value.trim();
    const orderStatus = $('#statusFilter').value;
    const paymentStatus = $('#paymentFilter').value;
    if (q) params.set('q', q);
    if (orderStatus) params.set('order_status', orderStatus);
    if (paymentStatus) params.set('payment_status', paymentStatus);

    const data = await api(`/api/admin/orders?${params}`);
    ordersCache = data.orders || [];
    renderSummary(ordersCache);
    renderOrders(ordersCache);
  } catch (error) {
    $('#orders').innerHTML = `<div class="message">${escapeHtml(error.message)}</div>`;
  }
}

function renderSummary(orders) {
  const counts = {
    pending: orders.filter(o => o.payment_status === 'pending' && o.order_status !== 'cancelled').length,
    preparing: orders.filter(o => o.order_status === 'preparing').length,
    ready: orders.filter(o => o.order_status === 'ready').length,
    completed: orders.filter(o => o.order_status === 'completed').length
  };
  $('#summary').innerHTML = `
    <div class="summary-card"><span>待付款</span><strong>${counts.pending}</strong></div>
    <div class="summary-card"><span>制作中</span><strong>${counts.preparing}</strong></div>
    <div class="summary-card"><span>待取餐</span><strong>${counts.ready}</strong></div>
    <div class="summary-card"><span>已取餐</span><strong>${counts.completed}</strong></div>
  `;
}

function renderOrders(orders) {
  const root = $('#orders');
  if (!orders.length) {
    root.innerHTML = '<div class="message">没有符合条件的订单</div>';
    return;
  }

  root.innerHTML = orders.map((order) => {
    const statusLabel = { new:'新订单', preparing:'制作中', ready:'待取餐', completed:'已取餐', cancelled:'已取消' }[order.order_status] || order.order_status;
    const paymentLabel = order.payment_status === 'paid' ? '已付款' : '待付款';
    const items = (order.items || []).map(item => `
      <div class="item-row"><span>${escapeHtml(item.product_name)} × ${item.quantity}</span><strong>${money(item.price_cents * item.quantity)}</strong></div>
    `).join('');

    return `
      <article class="order-card" data-id="${order.id}">
        <div class="order-top">
          <div><div class="code">${escapeHtml(order.pickup_code)}</div><div class="time">${escapeHtml(order.created_at || '')}</div></div>
          <div class="badges"><span class="badge ${order.payment_status}">${paymentLabel}</span><span class="badge">${statusLabel}</span></div>
        </div>
        <div class="items">${items}<div class="item-row"><span>合计</span><strong>${money(order.total_cents)}</strong></div></div>
        <div class="customer">
          <span>${escapeHtml(order.customer_name)} · ${escapeHtml(order.phone)}</span>
          ${order.pickup_slot ? `<span>取餐：${escapeHtml(order.pickup_slot)}</span>` : ''}
          ${order.note ? `<span>备注：${escapeHtml(order.note)}</span>` : ''}
        </div>
        <div class="order-actions">
          ${order.payment_status !== 'paid' ? `<button class="strong" data-action="paid">确认收款</button>` : ''}
          ${order.order_status === 'new' ? `<button data-action="preparing">开始制作</button>` : ''}
          ${['new','preparing'].includes(order.order_status) ? `<button data-action="ready">可取餐</button>` : ''}
          ${order.order_status === 'ready' ? `<button class="strong" data-action="completed">确认取餐</button>` : ''}
          ${!['completed','cancelled'].includes(order.order_status) ? `<button data-action="cancelled">取消订单</button>` : ''}
        </div>
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.order-card');
      const id = card.dataset.id;
      const action = button.dataset.action;
      const payload = action === 'paid' ? { payment_status:'paid' } : { order_status:action };
      button.disabled = true;
      try {
        await api(`/api/admin/order/${id}`, {
          method:'PATCH',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify(payload)
        });
        await loadOrders();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}

async function loadProducts() {
  try {
    const data = await api('/api/admin/products');
    renderProducts(data.products || []);
  } catch (error) {
    $('#productsAdmin').innerHTML = `<div class="message">${escapeHtml(error.message)}</div>`;
  }
}

function renderProducts(products) {
  const root = $('#productsAdmin');
  if (!products.length) {
    root.innerHTML = '<div class="message">还没有商品</div>';
    return;
  }
  root.innerHTML = products.map(p => `
    <article class="order-card product-admin-row" data-product-id="${p.id}">
      <input class="emoji" value="${escapeAttr(p.emoji || '🥐')}" maxlength="8" aria-label="emoji" />
      <input class="name" value="${escapeAttr(p.name)}" aria-label="商品名" />
      <input class="price-input" type="number" step="0.01" min="0" value="${(p.price_cents / 100).toFixed(2)}" aria-label="价格" />
      <input class="desc" value="${escapeAttr(p.description || '')}" aria-label="描述" />
      <label class="switch"><input class="active" type="checkbox" ${p.active ? 'checked' : ''} /> 上架</label>
      <button class="ghost save-product">保存</button>
    </article>
  `).join('');

  root.querySelectorAll('.save-product').forEach(button => {
    button.addEventListener('click', async () => {
      const row = button.closest('[data-product-id]');
      const id = row.dataset.productId;
      const price = Number(row.querySelector('.price-input').value);
      if (!Number.isFinite(price) || price < 0) return alert('价格不正确');
      button.disabled = true;
      try {
        await api(`/api/admin/product/${id}`, {
          method:'PATCH',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify({
            emoji:row.querySelector('.emoji').value,
            name:row.querySelector('.name').value,
            price_cents:Math.round(price * 100),
            description:row.querySelector('.desc').value,
            active:row.querySelector('.active').checked ? 1 : 0
          })
        });
        button.textContent = '已保存';
        setTimeout(() => button.textContent = '保存', 1000);
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function addProduct() {
  const price = Number($('#newPrice').value);
  if (!$('#newName').value.trim()) return alert('请输入商品名');
  if (!Number.isFinite(price) || price < 0) return alert('请输入正确价格');

  const button = $('#addProduct');
  button.disabled = true;
  try {
    await api('/api/admin/products', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        emoji:$('#newEmoji').value,
        name:$('#newName').value,
        price_cents:Math.round(price * 100),
        description:$('#newDescription').value
      })
    });
    $('#newName').value = '';
    $('#newPrice').value = '';
    $('#newDescription').value = '';
    await loadProducts();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#096;'); }

$('#saveToken').addEventListener('click', enterAdmin);
$('#tokenInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterAdmin(); });
$('#changeToken').addEventListener('click', () => { sessionStorage.removeItem('bakery_admin_token'); token=''; showLogin(); });
$('#refreshOrders').addEventListener('click', loadOrders);
$('#statusFilter').addEventListener('change', loadOrders);
$('#paymentFilter').addEventListener('change', loadOrders);
let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 250); });
$('#addProduct').addEventListener('click', addProduct);

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  const which = tab.dataset.tab;
  $('#ordersTab').hidden = which !== 'orders';
  $('#productsTab').hidden = which !== 'products';
  if (which === 'products') loadProducts();
}));

if (token) {
  showApp();
  Promise.all([loadOrders(), loadProducts()]).catch(() => {});
} else {
  showLogin();
}
