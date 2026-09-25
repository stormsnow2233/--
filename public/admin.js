const importInput = document.getElementById('importInput');
const adminSecretInput = document.getElementById('adminSecretInput');
const parseBtn = document.getElementById('parseBtn');
const submitBatchBtn = document.getElementById('submitBatchBtn');
const batchMessageBox = document.getElementById('batchMessage');
const parsedTableBody = document.getElementById('parsedTableBody');
const previewWrap = document.getElementById('previewWrap');
const importedList = document.getElementById('importedList');

let parsedItems = [];

function getAdminSecret() {
  const defaultSecret = 'admin123';
  const savedSecret = localStorage.getItem('admin_key') || defaultSecret;

  if (savedSecret) {
    adminSecretInput.value = savedSecret;
    localStorage.setItem('admin_key', savedSecret);
    return savedSecret;
  }

  const promptValue = window.prompt('请输入管理密钥：') || defaultSecret;
  localStorage.setItem('admin_key', promptValue);
  adminSecretInput.value = promptValue;
  return promptValue;
}

function showMessage(text, type = 'success') {
  batchMessageBox.textContent = text;
  batchMessageBox.className = `message ${type}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderImportedList(items) {
  if (!items || items.length === 0) {
    importedList.innerHTML = '<tr><td colspan="4" class="empty">暂无已导入资源</td></tr>';
    return;
  }

  importedList.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name || '未命名文件')}</td>
          <td><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url || '—')}</a></td>
          <td>${escapeHtml(item.pwd || '—')}</td>
          <td>${escapeHtml(item.size || '—')}</td>
        </tr>
      `
    )
    .join('');
}

function renderParsedItems(items) {
  parsedItems = items;

  if (!items.length) {
    parsedTableBody.innerHTML = '';
    previewWrap.classList.remove('visible');
    return;
  }

  previewWrap.classList.add('visible');
  parsedTableBody.innerHTML = items
    .map(
      (item, index) => `
        <tr>
          <td><input data-index="${index}" data-field="name" value="${escapeHtml(item.name)}" /></td>
          <td><input data-index="${index}" data-field="url" value="${escapeHtml(item.url)}" /></td>
          <td><input data-index="${index}" data-field="pwd" value="${escapeHtml(item.pwd)}" /></td>
          <td><input data-index="${index}" data-field="size" value="${escapeHtml(item.size)}" /></td>
          <td><button type="button" class="delete" data-remove-index="${index}">删除</button></td>
        </tr>
      `
    )
    .join('');

  parsedTableBody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      const rowIndex = Number(target.dataset.index);
      const field = target.dataset.field;
      parsedItems[rowIndex][field] = target.value;
    });
  });

  parsedTableBody.querySelectorAll('[data-remove-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const rowIndex = Number(button.dataset.removeIndex);
      parsedItems.splice(rowIndex, 1);
      renderParsedItems(parsedItems);
    });
  });
}

function handleParseBatch() {
  const items = parseBatchInput(importInput.value || '');

  if (!items.length) {
    showMessage('未识别到有效的分享链接，请重新粘贴文本。', 'error');
    renderParsedItems([]);
    return;
  }

  renderParsedItems(items);
  showMessage(`已识别 ${items.length} 条资源，可继续微调。`, 'success');
}

async function fetchImportedItems() {
  try {
    const response = await fetch('/api/imported-items');
    const data = await response.json();
    renderImportedList(data.items || []);
  } catch (error) {
    showMessage('读取已导入资源失败', 'error');
  }
}

async function submitBatchImport() {
  if (!parsedItems.length) {
    showMessage('请先解析并确认预览数据。', 'error');
    return;
  }

  const adminSecret = getAdminSecret();
  if (!adminSecret) {
    showMessage('管理密钥不能为空。', 'error');
    return;
  }

  try {
    const response = await fetch('/api/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'batch_import',
        authKey: adminSecret,
        parent_id: 0,
        items: parsedItems.map((item) => ({
          name: item.name || '未命名文件',
          url: item.url || '',
          pwd: item.pwd || '',
          size: item.size || '',
          is_dir: 0,
        })),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || '导入失败');
    }

    showMessage(data.message || '导入成功', 'success');
    importInput.value = '';
    renderParsedItems([]);
    await fetchImportedItems();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

parseBtn.addEventListener('click', handleParseBatch);
submitBatchBtn.addEventListener('click', submitBatchImport);
fetchImportedItems();
