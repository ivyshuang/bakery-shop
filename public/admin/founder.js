(() => {
  const root = document.querySelector('#founderTab');
  const e = escapeHtml;
  const categories = { PREPARATION: '筹办', EXPERIMENT: '试验', REGISTRATION: '注册', OFFICE: '办公', OTHER: '其他' };
  const statuses = { PENDING_CONVERSION: '待企业成立后确认', COMPANY_CONFIRMED: '企业已确认', PERSONAL: '个人承担', REIMBURSED: '已报销' };
  const paymentMethods = ['微信', '支付宝', '银行卡', '现金', '其他'];
  const purposes = ['未来企业筹建', '经营方案试验', '设备或材料验证', '注册筹备', '办公筹备', '其他'];
  const outcomes = ['未完成', '成功', '失败', '中止', '部分成功'];
  const disposals = ['无', '继续使用', '退货退款', '报废', '由商家处理', '转个人使用', '其他'];
  let records = [];
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const yuan = cents => cents === undefined || cents === null ? '' : (Number(cents) / 100).toFixed(2);
  const toCents = value => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error('金额不正确'); return Math.round(n * 100); };
  const optionList = (items, selected) => items.map(item => `<option value="${e(item)}" ${item === selected ? 'selected' : ''}>${e(item)}</option>`).join('');
  root.innerHTML = `<div class="decision-intro admin-card"><div><h2>创始人代垫支出</h2><p>记录企业成立前由你个人支付、但与未来企业筹建有关的支出。</p></div><button type="button" class="primary" id="newFounderExpense">新增支出</button></div><div class="procurement-controls"><button type="button" class="ghost" id="refreshFounder">刷新</button></div><p id="founderStatus" role="status"></p><div id="founderList" class="decision-list"></div>`;
  const dialog = document.createElement('dialog'); dialog.className = 'procurement-dialog'; document.body.append(dialog);
  const find = selector => root.querySelector(selector);
  function formFields(r = {}) {
    return `<label>支出日期<input name="spent_on" type="date" required value="${e(r.spent_on || localDate())}" /></label>
      <label>项目名称<input name="title" required maxlength="160" value="${e(r.title || '')}" placeholder="例如：三轮车台面方案试验" /></label>
      <label>支出类别<select name="category">${Object.entries(categories).map(([k, v]) => `<option value="${k}" ${k === (r.category || 'EXPERIMENT') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>原始付款金额（元）<input name="gross_paid" type="number" min="0" step="0.01" required value="${yuan(r.gross_paid_cents)}" /></label>
      <label>退款金额（元）<input name="refunded" type="number" min="0" step="0.01" value="${yuan(r.refunded_cents)}" /></label>
      <label>付款方式<select name="payment_method"><option value="">请选择</option>${optionList(paymentMethods, r.payment_method)}</select></label>
      <label>收款方<input name="payee" maxlength="160" value="${e(r.payee || '')}" placeholder="商家或师傅名称" /></label>
      <label>原付款流水号<input name="payment_reference" maxlength="160" value="${e(r.payment_reference || '')}" /></label>
      <label>退款流水号<input name="refund_reference" maxlength="160" value="${e(r.refund_reference || '')}" /></label>
      <label>用途<select name="purpose"><option value="">请选择</option>${optionList(purposes, r.purpose)}</select></label>
      <label>结果<select name="outcome"><option value="">请选择</option>${optionList(outcomes, r.outcome)}</select></label>
      <label>废料/资产处置<select name="disposal"><option value="">请选择</option>${optionList(disposals, r.disposal)}</select></label>
      <label>状态<select name="status">${Object.entries(statuses).map(([k, v]) => `<option value="${k}" ${k === (r.status || 'PENDING_CONVERSION') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="full-width">补充说明<textarea name="evidence_note" rows="2" maxlength="2000" placeholder="例如：师傅焊接质量不佳，车身被刮伤">${e(r.evidence_note || '')}</textarea></label>
      <label class="full-width">发票/付款/退款凭证<input name="evidence_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/ofd,application/xml,text/xml" /><small>支持 JPG、PNG、WebP、PDF、OFD、XML，单个文件最多 10 MB。</small><span data-file-status>${r.has_evidence ? `已保存：${e(r.file_name || '凭证文件')}` : '可上传发票、付款截图或退款记录'}</span></label>`;
  }
  function render() {
    find('#founderList').innerHTML = records.length ? records.map(r => `<article class="decision-card"><header><div><span class="decision-date">${e(r.spent_on)}</span><h3>${e(r.title)}</h3></div><span class="decision-status">${e(statuses[r.status] || r.status)}</span></header><dl><div><dt>净支出</dt><dd>${money(r.net_amount_cents)}（原付 ${money(r.gross_paid_cents)}，退 ${money(r.refunded_cents)}）</dd></div><div><dt>类别</dt><dd>${e(categories[r.category] || r.category)}</dd></div>${r.purpose ? `<div><dt>用途</dt><dd>${e(r.purpose)}</dd></div>` : ''}${r.outcome ? `<div><dt>结果</dt><dd>${e(r.outcome)}</dd></div>` : ''}${r.disposal ? `<div><dt>处置</dt><dd>${e(r.disposal)}</dd></div>` : ''}${r.has_evidence ? `<div><dt>凭证</dt><dd><button class="ghost" type="button" data-file="${r.id}">下载 ${e(r.file_name || '凭证')}</button></dd></div>` : ''}</dl><div class="decision-actions"><button class="ghost" data-edit="${r.id}">编辑</button><button class="ghost danger" data-delete="${r.id}">删除</button></div></article>`).join('') : '<p class="message">暂无创始人代垫支出</p>';
  }
  async function load() { find('#founderStatus').textContent = '正在读取…'; try { const data = await api('/api/admin/founder/expenses'); records = data.records || []; find('#founderStatus').textContent = ''; render(); } catch (error) { find('#founderStatus').textContent = error.message; } }
  window.loadFounderRecords = load;
  function openEditor(record = {}) {
    const editing = Boolean(record.id);
    dialog.innerHTML = `<form class="procurement-form"><h2>${editing ? '编辑' : '新增'}创始人代垫支出</h2><div class="procurement-fields">${formFields(record)}</div><p class="form-error" role="alert"></p><div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button><button type="submit" class="primary">保存</button></div></form>`;
    const form = dialog.querySelector('form'); const file = form.elements.evidence_file; let evidenceData;
    file.onchange = async () => { const selected = file.files[0]; if (!selected) return; const status = form.querySelector('[data-file-status]'); try { if (selected.size > 10 * 1024 * 1024) throw new Error('凭证文件不能超过10 MB'); evidenceData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(selected); }); status.textContent = `已选择：${selected.name}`; } catch (error) { file.value = ''; status.textContent = error.message; } };
    form.querySelector('[data-close]').onclick = () => dialog.close();
    form.onsubmit = async event => { event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true; try { const data = Object.fromEntries(new FormData(form)); data.gross_paid_cents = toCents(data.gross_paid); data.refunded_cents = toCents(data.refunded || 0); delete data.gross_paid; delete data.refunded; data.business_relevance = 1; data.decision_id = ''; if (evidenceData !== undefined) { data.evidence_data = evidenceData; data.evidence_file_name = file.files[0].name; } await api(`/api/admin/founder/expenses${editing ? `/${record.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); dialog.close(); await load(); } catch (error) { form.querySelector('.form-error').textContent = error.message; button.disabled = false; } };
    dialog.showModal();
  }
  async function downloadFile(id) { const response = await fetch(`/api/admin/founder/expenses/${id}/file`, { headers: headers() }); if (!response.ok) throw new Error('凭证下载失败'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = records.find(r => r.id === id)?.file_name || '凭证文件'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  root.addEventListener('click', async event => { const button = event.target.closest('button'); if (!button) return; if (button.id === 'newFounderExpense') return openEditor(); if (button.id === 'refreshFounder') return load(); if (button.dataset.file) { button.disabled = true; try { await downloadFile(Number(button.dataset.file)); } catch (error) { alert(error.message); } finally { button.disabled = false; } return; } if (button.dataset.edit) return openEditor(records.find(r => r.id === Number(button.dataset.edit))); if (button.dataset.delete && confirm('确定删除这条记录吗？')) { button.disabled = true; try { await api(`/api/admin/founder/expenses/${button.dataset.delete}`, { method: 'DELETE' }); await load(); } catch (error) { alert(error.message); button.disabled = false; } } });
})();
