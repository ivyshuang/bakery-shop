(() => {
  const root = document.querySelector('#decisionsTab');
  const statusLabels = { ACTIVE: '有效', SUPERSEDED: '已替代', ARCHIVED: '已归档' };
  let records = [];
  const e = escapeHtml;
  const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  root.innerHTML = `
    <div class="decision-intro admin-card">
      <div><h2>创始人决策记录</h2><p>保存试验结论和经营原则，不计入采购账。</p></div>
      <button type="button" class="primary" id="newDecision">新增决策</button>
    </div>
    <div class="decision-toolbar">
      <input id="decisionSearch" placeholder="搜索问题、决定或原则" aria-label="搜索决策记录" />
      <select id="decisionStatus" aria-label="记录状态">
        <option value="">全部状态</option>
        <option value="ACTIVE">有效</option>
        <option value="SUPERSEDED">已替代</option>
        <option value="ARCHIVED">已归档</option>
      </select>
      <button type="button" class="ghost" id="refreshDecisions">刷新</button>
    </div>
    <p id="decisionStatusText" role="status"></p>
    <div id="decisionList" class="decision-list"></div>`;

  const dialog = document.createElement('dialog');
  dialog.className = 'procurement-dialog decision-dialog';
  document.body.append(dialog);
  const find = selector => root.querySelector(selector);

  window.loadDecisions = async () => {
    find('#decisionStatusText').textContent = '正在读取…';
    try {
      const data = await api('/api/admin/decisions');
      records = data.records || [];
      find('#decisionStatusText').textContent = '';
      render();
    } catch (error) {
      find('#decisionStatusText').textContent = error.message;
    }
  };

  function render() {
    const query = find('#decisionSearch').value.trim().toLowerCase();
    const status = find('#decisionStatus').value;
    const filtered = records.filter(record => !status || record.status === status)
      .filter(record => `${record.title} ${record.problem} ${record.decision} ${record.principle} ${record.scope}`.toLowerCase().includes(query));

    find('#decisionList').innerHTML = filtered.length ? filtered.map(record => `
      <article class="decision-card" data-id="${record.id}">
        <header>
          <div><span class="decision-date">${e(record.decided_on)}</span><h3>${e(record.title)}</h3></div>
          <span class="decision-status status-${e(record.status.toLowerCase())}">${e(statusLabels[record.status] || record.status)}</span>
        </header>
        <dl>
          <div><dt>问题</dt><dd>${e(record.problem)}</dd></div>
          ${record.experiment ? `<div><dt>试验</dt><dd>${e(record.experiment)}</dd></div>` : ''}
          ${record.outcome ? `<div><dt>结果</dt><dd>${e(record.outcome)}</dd></div>` : ''}
          <div><dt>决定</dt><dd>${e(record.decision)}</dd></div>
          <div class="decision-principle"><dt>原则</dt><dd>${e(record.principle)}</dd></div>
          ${record.scope ? `<div><dt>适用范围</dt><dd>${e(record.scope)}</dd></div>` : ''}
        </dl>
        <div class="decision-actions">
          <button type="button" class="ghost" data-edit="${record.id}">编辑</button>
          <button type="button" class="ghost danger" data-delete="${record.id}">删除</button>
        </div>
      </article>`).join('') : '<p class="message">暂无符合条件的决策记录</p>';
  }

  function field(label, name, value = '', required = false) {
    return `<label>${label}<textarea name="${name}" rows="3" ${required ? 'required' : ''}>${e(value)}</textarea></label>`;
  }

  function openEditor(record = {}) {
    const editing = Boolean(record.id);
    dialog.innerHTML = `
      <form class="procurement-form decision-form">
        <h2 id="decisionDialogTitle">${editing ? '编辑决策' : '新增决策'}</h2>
        <div class="procurement-fields">
          <label>标题<input name="title" required maxlength="120" value="${e(record.title || '')}" placeholder="例如：三轮车台面安装" /></label>
          <label>决定日期<input name="decided_on" required type="date" value="${e(record.decided_on || localDate())}" /></label>
          <label>状态<select name="status">
            ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === (record.status || 'ACTIVE') ? 'selected' : ''}>${label}</option>`).join('')}
          </select></label>
          ${field('问题', 'problem', record.problem, true)}
          ${field('试验（选填）', 'experiment', record.experiment)}
          ${field('结果（选填）', 'outcome', record.outcome)}
          ${field('决定', 'decision', record.decision, true)}
          ${field('原则', 'principle', record.principle, true)}
          ${field('适用范围（选填）', 'scope', record.scope)}
        </div>
        <p class="form-error" role="alert"></p>
        <div class="dialog-buttons"><button type="button" class="ghost" data-close>取消</button><button type="submit" class="primary">保存</button></div>
      </form>`;
    dialog.setAttribute('aria-labelledby', 'decisionDialogTitle');
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const data = Object.fromEntries(new FormData(form));
      button.disabled = true;
      form.querySelector('.form-error').textContent = '';
      try {
        await api(editing ? `/api/admin/decisions/${record.id}` : '/api/admin/decisions', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        dialog.close();
        await window.loadDecisions();
      } catch (error) {
        form.querySelector('.form-error').textContent = error.message;
        button.disabled = false;
      }
    };
    dialog.showModal();
  }

  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'newDecision') return openEditor();
    if (button.id === 'refreshDecisions') return window.loadDecisions();
    if (button.dataset.edit) {
      const record = records.find(item => item.id === Number(button.dataset.edit));
      if (record) openEditor(record);
    }
    if (button.dataset.delete) {
      const record = records.find(item => item.id === Number(button.dataset.delete));
      if (!record || !confirm(`确定删除“${record.title}”吗？`)) return;
      button.disabled = true;
      try {
        await api(`/api/admin/decisions/${record.id}`, { method: 'DELETE' });
        await window.loadDecisions();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    }
  });
  find('#decisionSearch').oninput = render;
  find('#decisionStatus').onchange = render;
})();
