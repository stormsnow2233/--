const importInput = document.getElementById('importInput');
const adminSecretInput = document.getElementById('adminSecretInput');
const parseBtn = document.getElementById('parseBtn');
const submitBatchBtn = document.getElementById('submitBatchBtn');
const batchMessageBox = document.getElementById('batchMessage');
const parsedTableBody = document.getElementById('parsedTableBody');
const previewWrap = document.getElementById('previewWrap');
const folderTree = document.getElementById('folderTree');
const folderItemsBody = document.getElementById('folderItemsBody');
const currentFolderLabel = document.getElementById('currentFolderLabel');
const folderBreadcrumb = document.getElementById('folderBreadcrumb');
const uploadFileInput = document.getElementById('uploadFileInput');
const uploadBtn = document.getElementById('uploadBtn');
const createFolderBtn = document.getElementById('createFolderBtn');
const createFolderModal = document.getElementById('createFolderModal');
const createFolderInput = document.getElementById('createFolderInput');
const createFolderConfirm = document.getElementById('createFolderConfirm');
const createFolderCancel = document.getElementById('createFolderCancel');
const backFolderBtn = document.getElementById('backFolderBtn');

let parsedItems = [];
let allItems = [];
let currentFolderId = 0;

function getAdminSecret() {
  const defaultSecret = 'admin123';
  const savedSecret = localStorage.getItem('admin_key') || defaultSecret;

  adminSecretInput.value = savedSecret;
  localStorage.setItem('admin_key', savedSecret);
  return savedSecret;
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

function getFolderById(folderId) {
  return allItems.find((item) => String(item.id) === String(folderId) && item.is_dir);
}

function getCurrentFolderPath() {
  const path = [];
  let cursor = currentFolderId;

  while (cursor) {
    const folder = getFolderById(cursor);
    if (!folder) {
      break;
    }
    path.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parent_id || 0;
  }

  return path;
}

function renderFolderBreadcrumb() {
  const path = getCurrentFolderPath();
  const label = path.length ? path.map((item) => item.name).join(' / ') : '根目录';
  folderBreadcrumb.textContent = label;
  currentFolderLabel.textContent = `当前目录：${label}`;
}

function getVisibleItems() {
  return allItems.filter((item) => String(item.parent_id || 0) === String(currentFolderId));
}

function renderFolderTree(items, parentId = 0, depth = 0) {
  const children = items.filter((item) => String(item.parent_id || 0) === String(parentId) && item.is_dir);
  const html = children.length
    ? children
        .map((item) => {
          const nested = renderFolderTree(items, item.id, depth + 1);
          const activeClass = String(item.id) === String(currentFolderId) ? 'active' : '';
          return `
            <div class="tree-node" style="margin-left:${depth * 14}px">
              <button type="button" class="folder-tree-item ${activeClass}" data-folder-id="${item.id}">${escapeHtml(item.name)}</button>
              ${nested}
            </div>
          `;
        })
        .join('')
    : '<div class="tree-empty">空目录</div>';

  if (folderTree) {
    folderTree.innerHTML = html;
  }

  return html;
}

function renderFolderItems() {
  const items = getVisibleItems();

  if (!items.length) {
    folderItemsBody.innerHTML = '<tr><td colspan="4" class="empty">当前目录为空</td></tr>';
    return;
  }

  folderItemsBody.innerHTML = items
    .map((item) => {
      const typeLabel = item.is_dir ? '文件夹' : '文件';
      const detailText = item.is_dir ? '目录' : item.url || item.size || '—';
      return `
        <tr>
          <td>${escapeHtml(item.name || '未命名文件')}</td>
          <td>${typeLabel}</td>
          <td>${escapeHtml(detailText)}</td>
          <td>
            ${item.is_dir ? `<button type="button" class="secondary small" data-enter-id="${item.id}">进入</button>` : `<a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" class="tiny-link">打开</a>`}
            <button type="button" class="danger small" data-delete-id="${item.id}">删除</button>
            <select class="move-select" data-move-id="${item.id}">
              <option value="0">移动到：根目录</option>
              ${buildFolderOptions(item.id)}
            </select>
            <button type="button" class="secondary small" data-move-id="${item.id}">确认移动</button>
          </td>
        </tr>
      `;
    })
    .join('');

  folderItemsBody.querySelectorAll('[data-enter-id]').forEach((button) => {
    button.addEventListener('click', () => {
      currentFolderId = button.dataset.enterId;
      renderFolderBreadcrumb();
      renderFolderTree(allItems);
      renderFolderItems();
    });
  });

  folderItemsBody.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deleteId;
      const adminSecret = getAdminSecret();
      const response = await fetch(`/api/items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey: adminSecret }),
      });
      const data = await response.json();
      if (!response.ok) {
        showMessage(data.message || '删除失败', 'error');
        return;
      }
      showMessage('删除成功', 'success');
      await refreshAllData();
    });
  });

  folderItemsBody.querySelectorAll('[data-move-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemId = button.dataset.moveId;
      const row = button.closest('tr');
      const select = row ? row.querySelector('.move-select') : null;
      const targetParent = select ? select.value : '0';
      const adminSecret = getAdminSecret();
      const response = await fetch('/api/items/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, parent_id: targetParent, authKey: adminSecret }),
      });
      const data = await response.json();
      if (!response.ok) {
        showMessage(data.message || '移动失败', 'error');
        return;
      }
      showMessage('移动成功', 'success');
      await refreshAllData();
    });
  });
}

function buildFolderOptions(excludeId) {
  const folders = allItems.filter((item) => item.is_dir && String(item.id) !== String(excludeId));

  function walk(items, parentId = 0, prefix = '') {
    const nodes = items.filter((item) => String(item.parent_id || 0) === String(parentId));
    return nodes.flatMap((item) => {
      const label = `${prefix}${item.name}`;
      const result = [`<option value="${item.id}">${escapeHtml(label)}</option>`];
      return result.concat(walk(items, item.id, `${prefix}— `));
    });
  }

  return walk(folders).join('');
}

async function refreshAllData() {
  try {
    const response = await fetch('/api/imported-items');
    const data = await response.json();
    allItems = data.items || [];
    renderFolderBreadcrumb();
    renderFolderTree(allItems);
    renderFolderItems();
    renderImportedList(data.items || []);
  } catch (error) {
    showMessage('读取目录失败', 'error');
  }
}

function renderImportedList(items) {
  const importedList = document.getElementById('importedList');
  if (!importedList) {
    return;
  }

  if (!items || items.length === 0) {
    importedList.innerHTML = '<tr><td colspan="4" class="empty">暂无已导入资源</td></tr>';
    return;
  }

  importedList.innerHTML = items
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.name || '未命名文件')}</td>
        <td>${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">打开链接</a>` : '—'}</td>
        <td>${escapeHtml(item.pwd || '—')}</td>
        <td>${escapeHtml(item.size || '—')}</td>
      </tr>
    `)
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
    allItems = data.items || [];
    renderFolderTree(allItems);
    renderFolderItems();
    renderImportedList(data.items || []);
    renderFolderBreadcrumb();
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
        parent_id: currentFolderId,
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

function openCreateFolderModal() {
  if (!createFolderModal || !createFolderInput) {
    return;
  }

  createFolderInput.value = '';
  createFolderModal.classList.add('visible');
  createFolderInput.focus();
}

function closeCreateFolderModal() {
  if (!createFolderModal) {
    return;
  }

  createFolderModal.classList.remove('visible');
  createFolderInput.value = '';
}

async function createFolderAtCurrent() {
  if (!createFolderInput || !createFolderModal) {
    return;
  }

  const folderName = createFolderInput.value.trim();
  if (!folderName) {
    showMessage('请输入文件夹名称', 'error');
    createFolderInput.focus();
    return;
  }

  closeCreateFolderModal();

  const adminSecret = getAdminSecret();
  const response = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      parent_id: currentFolderId,
      authKey: adminSecret,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    showMessage(data.message || '创建文件夹失败', 'error');
    return;
  }

  showMessage('文件夹创建成功', 'success');
  await fetchImportedItems();
}

async function uploadCurrentFolderFile() {
  const file = uploadFileInput.files[0];
  if (!file) {
    showMessage('请选择要上传的文件', 'error');
    return;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('parent_id', String(currentFolderId));

  const response = await fetch('/api/files', {
    method: 'POST',
    body: form,
  });

  const data = await response.json();
  if (!response.ok) {
    showMessage(data.message || '上传失败', 'error');
    return;
  }

  uploadFileInput.value = '';
  showMessage('上传成功', 'success');
  await fetchImportedItems();
}

if (parseBtn) {
  parseBtn.addEventListener('click', handleParseBatch);
}

if (submitBatchBtn) {
  submitBatchBtn.addEventListener('click', submitBatchImport);
}

if (createFolderBtn) {
  createFolderBtn.addEventListener('click', openCreateFolderModal);
}

if (createFolderConfirm) {
  createFolderConfirm.addEventListener('click', createFolderAtCurrent);
}

if (createFolderCancel) {
  createFolderCancel.addEventListener('click', closeCreateFolderModal);
}

if (createFolderInput) {
  createFolderInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      createFolderAtCurrent();
    }
    if (event.key === 'Escape') {
      closeCreateFolderModal();
    }
  });
}

if (createFolderModal) {
  createFolderModal.addEventListener('click', (event) => {
    if (event.target === createFolderModal) {
      closeCreateFolderModal();
    }
  });
}

if (backFolderBtn) {
  backFolderBtn.addEventListener('click', () => {
    const currentFolder = getFolderById(currentFolderId);
    currentFolderId = currentFolder ? currentFolder.parent_id || 0 : 0;
    renderFolderBreadcrumb();
    renderFolderTree(allItems);
    renderFolderItems();
  });
}

if (folderTree) {
  folderTree.addEventListener('click', (event) => {
    const button = event.target.closest('[data-folder-id]');
    if (!button) {
      return;
    }
    currentFolderId = button.dataset.folderId;
    renderFolderBreadcrumb();
    renderFolderTree(allItems);
    renderFolderItems();
  });
}

if (uploadBtn) {
  uploadBtn.addEventListener('click', uploadCurrentFolderFile);
}

getAdminSecret();
fetchImportedItems();
