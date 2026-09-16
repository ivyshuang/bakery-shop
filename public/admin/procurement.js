(() => {
  const root = document.querySelector('#procurementTab');
  const categories = { INGREDIENT: '原料', PACKAGING: '包装耗材', CONSUMABLE: '日常耗材', TOOL: '工具', EQUIPMENT: '设备', OTHER: '其他' };
  const types = { ONE_TIME: '一次性采购', RECURRING: '持续采购' };
  let supplies = [], purchases = [], view = 'purchases', historyId = '', loaded = false;
  const e = escapeHtml;
  root.innerHTML = `
    <div class="procurement-controls">
      <div class="purchase-tabs" aria-label="采购页面">
        <button type="button" class="ghost" data-view="purchases" aria-pressed="true">采购记录</button>
        <button type="button" class="ghost" data-view="supplies" aria-pressed="false">物品清单</button>
      </div>
      <button type="button" class="primary" id="newProcurement">新增采购</button>
    </div>
    <div class="procurement-controls">
      <input id="procurementSearch" placeholder="搜索物品名称 / 规格" aria-label="搜索物品名称或规格" />
      <select id="purchaseTypeFilter" aria-label="采购类型" hidden><option value="">全部采购类型</option><option value="ONE_TIME">一次性采购</option><option value="RECURRING">持续采购</option></select>
      <button type="button" class="ghost" id="clearPurchaseHistory" hidden>查看全部记录</button>
      <button type="button" class="ghost" id="refreshProcurement">刷新</button>
    </div>
    <p id="procurementStatus" role="status"></p>
    <div id="procurementList"></div>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'procurement-dialog';
  document.body.append(dialog);
  const find = selector => root.querySelector(selector);
  const supplyLabel = s => `${s.name}${s.specification ? ` · ${s.specification}` : ''}（${s.unit}）`;
  const options = (items, selected) => Object.entries(items).map(([key, label]) => `<option value="${e(key)}" ${key === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
  const input = (label, name, value = '', attrs = '') => `<label>${label}<input name="${name}" value="${e(value)}" ${attrs} />${name === 'amount' ? '<small>填写此物品的合计实付金额，不是单价。</small>' : ''}</label>`;
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

  window.loadProcurement = async () => {
    find('#procurementStatus').textContent = '正在读取…';
    try {
      const [s, p] = await Promise.all([api('/api/admin/supplies'), api('/api/admin/purchases')]);
      supplies = s.records; purchases = p.records; loaded = true;
      find('#procurementStatus').textContent = '';
      render();
      return true;
    } catch (error) {
      find('#procurementStatus').textContent = error.message;
      return false;
    }
  };
  function render() {
    const isSupply = view === 'supplies';
    find('#newProcurement').textContent = isSupply ? '新增物品' : '新增采购';
    find('#purchaseTypeFilter').hidden = true;
    find('#clearPurchaseHistory').hidden = isSupply || !historyId;
    root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    const q = find('#procurementSearch').value.trim().toLowerCase();
    const filter = find('#purchaseTypeFilter').value;
    const rows = (isSupply ? supplies : purchases).filter(r => `${r.name} ${r.specification}`.toLowerCase().includes(q))
      .filter(r => isSupply ? true : !historyId || r.supply_id === Number(historyId));
    const heads = isSupply ? ['物品 / 规格', '分类', '单位', '采购类型', '操作'] : ['日期', '物品 / 规格', '数量', '实付', '平台 / 店铺', '操作'];
    find('#procurementList').innerHTML = rows.length ? `<table class="procurement-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => {
      const name = `<strong>${e(r.name)}</strong>${r.specification ? `<small>${e(r.specification)}</small>` : ''}`;
      const cells = isSupply ? [name, e(categories[r.category]), e(r.unit), '持续采购', `<button class="ghost" data-edit="${r.id}">编辑</button> <button class="ghost" data-history="${r.id}">采购历史</button>`]
        : [e(r.purchased_on), name, `${r.quantity} ${e(r.unit)}`, money(r.amount_cents), `${e(r.platform)}<small>${e(r.shop)}</small>`, `<button class="ghost" data-edit="${r.id}">查看 / 编辑</button>`];
      return `<tr>${cells.map((cell,i) => `<td data-label="${heads[i]}">${cell}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table>` : '<p class="message">暂无符合条件的记录</p>';
  }
  function supplyFields(s = {}) {
    return `${input('物品名称', 'name', s.name, 'required maxlength="100"')}
      ${input('规格（选填）', 'specification', s.specification, 'maxlength="200"')}
      <label>分类<select name="category" required><option value="">请选择</option>${options(categories,s.category)}</select></label>
      ${input('计量单位', 'unit', s.unit, 'required maxlength="20" placeholder="例如：个、克、盒"')}
      `;
  }
  function openDialog(title, fields) {
    dialog.innerHTML = `<form class="procurement-form"><h2 id="procurementDialogTitle">${title}</h2><div class="procurement-fields">${fields}</div><p class="form-error" role="alert"></p><div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button><button class="primary" type="submit">保存</button></div></form>`;
    dialog.setAttribute('aria-labelledby', 'procurementDialogTitle');
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.showModal();
    return dialog.querySelector('form');
  }
  async function saveResource(resource, id, payload) {
    return api(`/api/admin/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
  function supplyPayload(container) {
    return Object.fromEntries(['name','specification','category','unit'].map(name => [name,container.querySelector(`[name="${name}"]`).value]));
  }
  function bindSubmit(form, save) {
    let saving = false;
    dialog.oncancel = event => { if (saving) event.preventDefault(); };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving) return;
      saving = true;
      const buttons = form.querySelectorAll('button');
      buttons.forEach(b => b.disabled = true);
      form.querySelector('.form-error').textContent = '';
      try {
        await save();
        dialog.close();
        await window.loadProcurement();
      } catch (error) { form.querySelector('.form-error').textContent = error.message; }
      finally { saving = false; buttons.forEach(b => b.disabled = false); }
    });
  }
  function editSupply(s = {}) {
    const form = openDialog(s.id ? '编辑物品' : '新增物品', supplyFields(s));
    if (s.id && purchases.some(p => p.supply_id === s.id)) {
      form.elements.unit.readOnly = true;
      form.elements.unit.title = '已有采购记录，单位不可修改';
    }
    bindSubmit(form, () => saveResource('supplies', s.id, supplyPayload(form)));
  }
  async function editPurchase(p = {}) {
    const selectOptions = supplies.map(s => `<option value="${s.id}" ${s.id === p.supply_id ? 'selected' : ''}>${e(supplyLabel(s))}</option>`).join('');
    const form = openDialog(p.id ? '采购详情 / 编辑' : '新增采购', `
      <label class="full-width">采购类型<select name="purchase_type" required><option value="">请选择</option>${options(types, p.purchase_type)}</select></label>
      <fieldset class="inline-supply full-width" hidden disabled><legend>持续采购物品</legend><label>物品<select name="supply_id"><option value="">请选择物品</option>${selectOptions}<option value="new">＋ 新建物品</option></select></label><div class="new-supply-fields procurement-fields" hidden>${supplyFields()}</div></fieldset>
      <div class="one-time-fields procurement-fields full-width">${input('物品名称', 'item_name', p.name, 'required maxlength="100"')}${input('规格（选填）', 'specification', p.specification, 'maxlength="200"')}<label>分类<select name="category" required><option value="">请选择</option>${options(categories,p.category)}</select></label>${input('计量单位', 'unit', p.unit, 'required maxlength="20" placeholder="例如：个、克、盒"')}</div>
      ${input('数量', 'quantity', p.quantity, 'required type="number" min="0.000001" max="1000000000" step="any"')}
      ${input('实付金额（元）', 'amount', p.id ? (p.amount_cents / 100).toFixed(2) : '', 'required type="number" min="0" max="10000000000" step="0.01"')}
      ${input('购买日期', 'purchased_on', p.purchased_on || localDate(), 'required type="date"')}
      <label>平台<input name="platform" list="purchasePlatforms" value="${e(p.platform || '')}" required maxlength="60" /><datalist id="purchasePlatforms"><option value="1688"><option value="拼多多"><option value="淘宝"></datalist></label>
      ${input('店铺', 'shop', p.shop, 'required maxlength="100"')}
      ${input('订单号（选填）', 'order_number', p.order_number, 'maxlength="100"')}
      <label class="full-width">商品链接（选填）<input name="product_url" type="url" value="${e(p.product_url || '')}" maxlength="2000" />${p.product_url ? `<a href="${e(p.product_url)}" target="_blank" rel="noopener noreferrer">打开商品链接</a>` : ''}</label>
      <label class="full-width">订单截图（选填）<input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" /><small>支持 JPG、PNG、WebP，最多 500 KB。</small></label>
      <div class="full-width screenshot-preview"><img alt="订单截图" hidden /><button class="ghost" type="button" data-remove-image hidden>移除截图</button><p role="status" data-image-status></p></div>`);
    const inline = form.querySelector('.inline-supply');
    const choice = form.elements.supply_id;
    const type = form.elements.purchase_type;
    const oneTime = form.querySelector('.one-time-fields');
    const newFields = inline.querySelector('.new-supply-fields');
    type.onchange = () => { const recurring = type.value === 'RECURRING'; inline.hidden = inline.disabled = !recurring; oneTime.hidden = recurring; oneTime.querySelectorAll('input,select').forEach(x => x.disabled = recurring); choice.required = recurring; newFields.hidden = choice.value !== 'new'; newFields.querySelectorAll('input,select').forEach(x => x.disabled = choice.value !== 'new' || !recurring); };
    type.value = p.purchase_type || 'ONE_TIME'; type.onchange();
    choice.onchange = () => { newFields.hidden = choice.value !== 'new'; newFields.querySelectorAll('input,select').forEach(x => x.disabled = choice.value !== 'new' || type.value !== 'RECURRING'); };
    let imageData;
    const preview = form.querySelector('.screenshot-preview img');
    const remove = form.querySelector('[data-remove-image]');
    const imageStatus = form.querySelector('[data-image-status]');
    let revision = 0;
    remove.onclick = () => { revision++; imageData = ''; preview.hidden = remove.hidden = true; preview.removeAttribute('src'); form.elements.screenshot.value = ''; imageStatus.textContent = ''; };
    let readingImage = false;
    form.elements.screenshot.onchange = async () => {
      const file = form.elements.screenshot.files[0];
      if (!file) return;
      const current = ++revision;
      readingImage = true;
      try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 512000) throw new Error('请选择不超过 500 KB 的 JPG、PNG 或 WebP 截图');
        const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('截图读取失败')); reader.readAsDataURL(file); });
        if (current !== revision) return;
        imageData = data; preview.src = data; preview.hidden = remove.hidden = false; imageStatus.textContent = '';
      } catch (error) { form.elements.screenshot.value = ''; imageStatus.textContent = error.message; }
      finally { readingImage = false; }
    };
    if (p.has_image) {
      const current = revision;
      imageStatus.textContent = '正在读取截图…';
      fetch(`/api/admin/purchases/${p.id}/image`, { headers: headers() }).then(async res => {
        if (!res.ok) throw new Error('截图读取失败，可关闭后重试');
        const blob = await res.blob();
        if (current !== revision || !dialog.open || !form.isConnected) return;
        const url = URL.createObjectURL(blob);
        preview.onload = preview.onerror = () => URL.revokeObjectURL(url);
        preview.src = url; preview.hidden = remove.hidden = false; imageStatus.textContent = '';
      }).catch(error => { if (current === revision && form.isConnected) imageStatus.textContent = error.message; });
    }
    bindSubmit(form, async () => {
      if (readingImage) throw new Error('截图正在读取，请稍后保存');
      let supplyId = null;
      if (type.value === 'RECURRING' && choice.value === 'new') {
        const payload = supplyPayload(inline);
        const created = await saveResource('supplies', null, payload);
        supplyId = created.id;
        supplies.unshift({ ...payload, id: supplyId });
        // Keep the created item selected if saving the purchase needs a retry.
        choice.add(new Option(supplyLabel(payload), String(supplyId)), 1);
        choice.value = String(supplyId); choice.onchange();
      }
      const recurring = type.value === 'RECURRING';
      if (recurring) supplyId = Number(choice.value);
      const selected = recurring ? supplies.find(s => s.id === supplyId) : null;
      await saveResource('purchases', p.id, {
        supply_id: supplyId, purchase_type: type.value, item_name: recurring ? selected.name : form.elements.item_name.value,
        specification: recurring ? selected.specification : form.elements.specification.value, category: recurring ? selected.category : form.elements.category.value, unit: recurring ? selected.unit : form.elements.unit.value,
        quantity: Number(form.elements.quantity.value),
        amount_cents: Math.round(Number(form.elements.amount.value) * 100),
        platform: form.elements.platform.value, shop: form.elements.shop.value,
        order_number: form.elements.order_number.value, product_url: form.elements.product_url.value,
        purchased_on: form.elements.purchased_on.value, ...(imageData === undefined ? {} : { image_data: imageData })
      });
    });
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) { view = button.dataset.view; render(); }
    if (button.id === 'refreshProcurement') await window.loadProcurement();
    if (button.id === 'clearPurchaseHistory') { historyId = ''; render(); }
    if (button.id === 'newProcurement') {
      if (!loaded && !await window.loadProcurement()) return;
      if (view === 'supplies') editSupply(); else editPurchase();
    }
    if (button.dataset.edit) {
      const row = (view === 'supplies' ? supplies : purchases).find(r => r.id === Number(button.dataset.edit));
      if (view === 'supplies') editSupply(row); else editPurchase(row);
    }
    if (button.dataset.history) { historyId = button.dataset.history; view = 'purchases'; find('#procurementSearch').value = ''; render(); }
  });
  find('#procurementSearch').oninput = render;
  find('#purchaseTypeFilter').onchange = render;
})();
