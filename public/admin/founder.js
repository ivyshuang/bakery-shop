(() => {
  const root = document.querySelector('#founderTab');
  const e = escapeHtml;
  let records = [], receipts = [], view = 'expenses';
  const accepted = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/ofd', 'application/xml', 'text/xml'];
  root.innerHTML = `<div class="decision-intro admin-card"><div><h2>垫资与凭证</h2><p>上传订单 PDF 即建立记录；邮箱收到的凭证先进入待关联区。</p></div><button type="button" class="primary" id="newFounderExpense">上传订单 PDF</button></div>
    <div class="procurement-controls"><div class="purchase-tabs"><button class="ghost" data-founder-view="expenses" aria-pressed="true">垫资记录</button><button class="ghost" data-founder-view="receipts" aria-pressed="false">邮箱凭证</button></div><button class="ghost" id="refreshFounder">刷新</button></div>
    <p id="founderStatus" role="status"></p><div id="founderList" class="decision-list"></div>`;
  const dialog = document.createElement('dialog'); dialog.className = 'procurement-dialog'; document.body.append(dialog);
  const find = selector => root.querySelector(selector);
  const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`无法读取 ${file.name}`)); reader.readAsDataURL(file); });
  const size = bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  async function download(url, name) {
    const response = await fetch(url, { headers: headers() }); if (!response.ok) throw new Error('文件下载失败');
    const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = objectUrl; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  const expenseOptions = () => records.map(record => `<option value="${record.id}">${e(record.title)} · ${e(record.spent_on)}</option>`).join('');
  function render() {
    root.querySelectorAll('[data-founder-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.founderView === view)));
    find('#newFounderExpense').hidden = view !== 'expenses';
    if (view === 'expenses') {
      find('#founderList').innerHTML = records.length ? records.map(record => `<article class="decision-card"><header><div><span class="decision-date">${e(record.spent_on)}</span><h3>${e(record.title)}</h3></div><span class="decision-status">${record.files.length} 个文件</span></header>
        <div class="simple-file-list">${record.files.length ? record.files.map(file => `<button type="button" class="ghost" data-expense-file="${file.id}" data-expense="${record.id}">${e(file.file_name)} · ${e(size(file.file_size))}</button>`).join('') : '<span>暂无文件</span>'}</div>
        <div class="decision-actions"><button class="ghost" data-add-files="${record.id}">添加邮箱凭证</button><button class="ghost danger" data-delete="${record.id}">删除记录</button></div></article>`).join('') : '<p class="message">还没有垫资记录，上传一份订单 PDF 即可创建。</p>';
      return;
    }
    find('#founderList').innerHTML = receipts.length ? receipts.map(receipt => `<article class="decision-card"><header><div><span class="decision-date">${e(receipt.received_at || receipt.created_at)}</span><h3>${e(receipt.subject || '无主题邮件')}</h3><small>${e(receipt.sender)}</small></div><span class="decision-status">${receipt.status === 'LINKED' ? '已归档' : '待关联'}</span></header>
      <div class="simple-file-list">${receipt.files.length ? receipt.files.map(file => `<button type="button" class="ghost" data-receipt-file="${file.id}" data-receipt="${receipt.id}">${e(file.file_name)} · ${e(size(file.file_size))}</button>`).join('') : '<span>邮件没有附件，原始邮件已保存</span>'}</div>
      ${receipt.status === 'PENDING' && receipt.files.length ? `<div class="receipt-link"><select aria-label="选择垫资记录"><option value="">选择要归入的垫资记录</option>${expenseOptions()}</select><button class="primary" type="button" data-link-receipt="${receipt.id}">归入垫资</button></div>` : receipt.linked_expense_title ? `<p class="linked-note">已归入：${e(receipt.linked_expense_title)}</p>` : ''}<div class="decision-actions"><button class="ghost danger" type="button" data-delete-receipt="${receipt.id}" ${receipt.status === 'LINKED' ? 'disabled title="已关联的邮件不能删除"' : ''}>删除邮件凭证</button></div></article>`).join('') : '<p class="message">暂未收到邮件。配置 receipts@你的域名 后，新邮件会自动出现在这里。</p>';
  }
  async function load() {
    find('#founderStatus').textContent = '正在读取…';
    try { const [expenseData, receiptData] = await Promise.all([api('/api/admin/founder/expenses'), api('/api/admin/founder/receipts')]); records = expenseData.records || []; receipts = receiptData.records || []; find('#founderStatus').textContent = ''; render(); }
    catch (error) { find('#founderStatus').textContent = error.message; }
  }
  window.loadFounderRecords = load;
  function uploadDialog({ expenseId } = {}) {
    const quick = !expenseId;
    dialog.innerHTML = `<form class="procurement-form"><h2>${quick ? '上传订单 PDF' : '补充附件'}</h2><div class="procurement-fields"><label class="full-width">选择文件<input name="files" type="file" ${quick ? 'accept="application/pdf"' : 'multiple accept="image/jpeg,image/png,image/webp,application/pdf,application/ofd,application/xml,text/xml"'} required /><small>${quick ? '上传成功后会立即建立一条垫资记录。' : '可一次选择多个文件，每个不超过 10 MB。'}</small></label></div><p class="form-error" role="alert"></p><p data-progress role="status"></p><div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button>${quick ? '<button type="button" class="ghost" data-manual>暂不上传，手动新增</button>' : ''}<button type="submit" class="primary">上传</button></div></form>`;
    const form = dialog.querySelector('form'); form.querySelector('[data-close]').onclick = () => dialog.close();
    form.querySelector('[data-manual]')?.addEventListener('click', () => { dialog.close(); manualDialog(); });
    form.onsubmit = async event => {
      event.preventDefault(); const files = [...form.elements.files.files]; const error = form.querySelector('.form-error'); const progress = form.querySelector('[data-progress]'); if (!files.length) return;
      const invalid = files.find(file => file.size > 10 * 1024 * 1024 || (quick ? file.type !== 'application/pdf' : !accepted.includes(file.type))); if (invalid) { error.textContent = `${invalid.name} 格式不支持或超过 10 MB`; return; }
      form.querySelectorAll('button').forEach(button => button.disabled = true);
      try {
        if (quick) { progress.textContent = `正在上传 ${files[0].name}`; await api('/api/admin/founder/expenses/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: files[0].name, file_data: await readFile(files[0]) }) }); }
        else { for (let index = 0; index < files.length; index++) { progress.textContent = `正在上传 ${index + 1}/${files.length}：${files[index].name}`; await api(`/api/admin/founder/expenses/${expenseId}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: files[index].name, file_data: await readFile(files[index]) }) }); } }
        dialog.close(); await load();
      } catch (uploadError) { error.textContent = uploadError.message; form.querySelectorAll('button').forEach(button => button.disabled = false); }
    };
    dialog.showModal();
  }
  function emailLinkDialog(expenseId) {
    const pending = receipts.filter(receipt => receipt.status === 'PENDING' && receipt.files.length);
    if (!pending.length) { alert('邮箱凭证区暂无待关联文件。请先把发票或付款凭证发送到 receipts@你的域名。'); return; }
    dialog.innerHTML = `<form class="procurement-form"><h2>添加邮箱凭证</h2><p class="dialog-hint">选择要归入这条垫资记录的邮件，邮件中的附件会一起关联。</p><div class="receipt-picker">${pending.map(receipt => `<label class="receipt-picker-row"><input type="checkbox" name="receipt" value="${receipt.id}" /><span><strong>${e(receipt.subject || '无主题邮件')}</strong><small>${e(receipt.received_at || receipt.created_at)} · ${e(receipt.sender)}</small><small>${receipt.files.map(file => e(file.file_name)).join('、')}</small></span></label>`).join('')}</div><p class="form-error" role="alert"></p><p data-progress role="status"></p><div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button><button type="submit" class="primary">关联选中文件</button></div></form>`;
    const form = dialog.querySelector('form'); const progress = form.querySelector('[data-progress]');
    form.querySelector('[data-close]').onclick = () => dialog.close();
    form.onsubmit = async event => {
      event.preventDefault(); const selected = [...form.querySelectorAll('input[name="receipt"]:checked')].map(input => Number(input.value)); const error = form.querySelector('.form-error');
      if (!selected.length) { error.textContent = '请至少选择一封邮箱凭证'; return; }
      form.querySelectorAll('button').forEach(button => button.disabled = true);
      try { for (let index = 0; index < selected.length; index++) { progress.textContent = `正在关联 ${index + 1}/${selected.length}`; await api(`/api/admin/founder/receipts/${selected[index]}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expense_id: expenseId }) }); } dialog.close(); await load(); }
      catch (linkError) { error.textContent = linkError.message; form.querySelectorAll('button').forEach(button => button.disabled = false); }
    };
    dialog.showModal();
  }
  function manualDialog() {
    dialog.innerHTML = `<form class="procurement-form"><h2>手动新增垫资</h2><div class="procurement-fields"><label>项目名称<input name="title" required maxlength="160" placeholder="例如：线下购买三轮车" /></label><label>支出日期<input name="spent_on" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label><label>金额（元）<input name="gross_paid" type="number" min="0" step="0.01" value="0" /></label><label class="full-width">备注<textarea name="evidence_note" rows="2" maxlength="2000" placeholder="可稍后补充订单号、付款方式等信息"></textarea></label></div><p class="form-error" role="alert"></p><div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button><button type="submit" class="primary">创建记录</button></div></form>`;
    const form = dialog.querySelector('form'); form.querySelector('[data-close]').onclick = () => dialog.close();
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); const error = form.querySelector('.form-error'); button.disabled = true;
      try {
        const amount = Number(form.elements.gross_paid.value); if (!Number.isFinite(amount) || amount < 0) throw new Error('金额不正确');
        await api('/api/admin/founder/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spent_on: form.elements.spent_on.value, title: form.elements.title.value, category: 'PREPARATION', gross_paid_cents: Math.round(amount * 100), refunded_cents: 0, payment_method: '', payee: '', payment_reference: '', refund_reference: '', purpose: '', outcome: '', disposal: '', business_relevance: 1, status: 'PENDING_CONVERSION', decision_id: '', evidence_note: form.elements.evidence_note.value }) });
        dialog.close(); await load();
      } catch (saveError) { error.textContent = saveError.message; button.disabled = false; }
    };
    dialog.showModal();
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.founderView) { view = button.dataset.founderView; render(); return; }
    if (button.id === 'newFounderExpense') return uploadDialog();
    if (button.id === 'refreshFounder') return load();
    if (button.dataset.addFiles) return emailLinkDialog(Number(button.dataset.addFiles));
    if (button.dataset.expenseFile) { const record = records.find(item => item.id === Number(button.dataset.expense)); const file = record.files.find(item => item.id === Number(button.dataset.expenseFile)); return download(`/api/admin/founder/expenses/${record.id}/files/${file.id}`, file.file_name).catch(error => alert(error.message)); }
    if (button.dataset.receiptFile) { const receipt = receipts.find(item => item.id === Number(button.dataset.receipt)); const file = receipt.files.find(item => item.id === Number(button.dataset.receiptFile)); return download(`/api/admin/founder/receipts/${receipt.id}/files/${file.id}`, file.file_name).catch(error => alert(error.message)); }
    if (button.dataset.linkReceipt) { const select = button.closest('.receipt-link').querySelector('select'); if (!select.value) return alert('请先选择垫资记录'); button.disabled = true; try { await api(`/api/admin/founder/receipts/${button.dataset.linkReceipt}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expense_id: Number(select.value) }) }); await load(); } catch (error) { alert(error.message); button.disabled = false; } return; }
    if (button.dataset.deleteReceipt && confirm('确定删除这封邮件及其全部附件吗？此操作会同时删除 R2 文件和数据库记录。')) { button.disabled = true; try { await api(`/api/admin/founder/receipts/${button.dataset.deleteReceipt}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); button.disabled = false; } return; }
    if (button.dataset.delete && confirm('确定删除这条垫资记录及其自行上传的文件吗？')) { button.disabled = true; try { await api(`/api/admin/founder/expenses/${button.dataset.delete}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); button.disabled = false; } }
  });
})();
