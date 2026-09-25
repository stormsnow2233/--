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
const createFolderBtn = document.getElementById('createFolderBtn');
const createFolderModal = document.getElementById('createFolderModal');
const createFolderInput = document.getElementById('createFolderInput');
const createFolderConfirm = document.getElementById('createFolderConfirm');
const createFolderCancel = document.getElementById('createFolderCancel');
const backFolderBtn = document.getElementById('backFolderBtn');
const thankYouEditor = document.getElementById('thankYouEditor');
const saveThankYouBtn = document.getElementById('saveThankYouBtn');
const announcementEditor = document.getElementById('announcementEditor');
const saveAnnouncementBtn = document.getElementById('saveAnnouncementBtn');

let parsedItems = [];
let allItems = [];
let currentFolderId = 0;
const expandedFolders = new Set();
const ANNOUNCEMENT_KEY = 'announcement_markdown';
const DEFAULT_ANNOUNCEMENT = `欢迎来到 **网盘资源库**。

- 资源会持续整理和更新
- 点击文件即可打开对应链接
- 如果页面没有加载内容，请稍后刷新重试

[查看使用说明](https://example.com)`;

function getAdminSecret() {
  const defaultSecret = 'admin123';
  const savedSecret = localStorage.getItem('admin_key') || defaultSecret;

  adminSecretInput.value = savedSecret;
  localStorage.setItem('admin_key', savedSecret);
  return savedSecret;
}

function showMessage(text, type = 'success') {
  if (batchMessageBox) {
    batchMessageBox.textContent = text;
    batchMessageBox.className = `message ${type}`;
  }
}

function parseThankYouText(rawText) {
  const lines = String(rawText || '')
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const separatorIndex = line.indexOf('|');
      const label = (separatorIndex === -1 ? line : line.slice(0, separatorIndex)).trim();
      const url = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).trim();

      if (!label) {
        return null;
      }

      return { label, url };
    })
    .filter(Boolean);
}

function loadThankYouEditor() {
  if (!thankYouEditor) {
    return;
  }

  try {
    const raw = localStorage.getItem('thank_you_links');
    const links = raw ? JSON.parse(raw) : [];
    thankYouEditor.value = Array.isArray(links)
      ? links.map((item) => {
        if (!item || !item.label) {
          return '';
        }
        return item.url ? `${item.label} | ${item.url}` : item.label;
      }).filter(Boolean).join('\n')
      : '';
  } catch (error) {
    thankYouEditor.value = '';
  }
}

function saveThankYouSettings() {
  if (!thankYouEditor) {
    return;
  }

  const links = parseThankYouText(thankYouEditor.value);
  localStorage.setItem('thank_you_links', JSON.stringify(links));
  showMessage(links.length ? '感谢名单已保存' : '感谢名单已清空', links.length ? 'success' : 'error');
}

function loadAnnouncementEditor() {
  if (announcementEditor) {
    announcementEditor.value = localStorage.getItem(ANNOUNCEMENT_KEY) || DEFAULT_ANNOUNCEMENT;
  }
}

function saveAnnouncementSettings() {
  if (!announcementEditor) {
    return;
  }

  const markdown = announcementEditor.value.trim();
  if (!markdown) {
    showMessage('公告内容不能为空', 'error');
    return;
  }

  localStorage.setItem(ANNOUNCEMENT_KEY, markdown);
  showMessage('主页公告已保存', 'success');
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
  if (folderBreadcrumb) {
    folderBreadcrumb.textContent = label;
  }
  if (currentFolderLabel) {
    currentFolderLabel.textContent = `当前目录：${label}`;
  }
}

function getVisibleItems() {
  return allItems.filter((item) => String(item.parent_id || 0) === String(currentFolderId));
}

function isFolderInCurrentPath(folderId) {
  let cursor = currentFolderId;

  while (cursor) {
    if (String(cursor) === String(folderId)) {
      return true;
    }

    const folder = getFolderById(cursor);
    cursor = folder ? folder.parent_id || 0 : 0;
  }

  return false;
}

function buildFolderTreeHtml(items, parentId = 0) {
  const children = items.filter((item) => String(item.parent_id || 0) === String(parentId) && item.is_dir);

  return children
    .map((item) => {
      const nestedItems = items.filter((child) => String(child.parent_id || 0) === String(item.id) && child.is_dir);
      const hasChildren = nestedItems.length > 0;
      const expanded = expandedFolders.has(String(item.id)) || isFolderInCurrentPath(item.id);
      const activeClass = String(item.id) === String(currentFolderId) ? 'active' : '';

      return `
        <div class="tree-node ${expanded ? 'expanded' : ''}">
          <div class="tree-row">
            <button type="button" class="tree-toggle ${hasChildren ? '' : 'is-empty'}" data-toggle-folder="${item.id}" aria-expanded="${expanded}" aria-label="展开或收起 ${escapeHtml(item.name)}">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button type="button" class="folder-tree-item ${activeClass}" data-folder-id="${item.id}">
              <i class="fa-solid fa-folder"></i>
              <span>${escapeHtml(item.name)}</span>
            </button>
          </div>
          <div class="tree-children">${buildFolderTreeHtml(items, item.id)}</div>
        </div>
      `;
    })
    .join('');
}

function renderFolderTree(items) {
  if (!folderTree) {
    return;
  }

  const rootActive = currentFolderId === 0 ? 'active' : '';
  const nested = buildFolderTreeHtml(items);
  folderTree.innerHTML = `
    <div class="tree-root">
      <button type="button" class="folder-tree-item ${rootActive}" data-folder-id="0">
        <i class="fa-solid fa-house"></i>
        <span>根目录</span>
      </button>
    </div>
    ${nested || '<div class="tree-empty">暂无子目录</div>'}
  `;
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
            <div class="row-actions">
              ${item.is_dir ? `<button type="button" class="secondary small" data-enter-id="${item.id}">进入</button>` : `<a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" class="tiny-link">打开</a>`}
              <button type="button" class="danger small" data-delete-id="${item.id}">删除</button>
            </div>
            <div class="move-control">
              <label class="move-label">移动到</label>
              <select class="move-select" data-move-id="${item.id}">
                <option value="0">根目录</option>
                ${buildFolderOptions(item.id)}
              </select>
              <button type="button" class="secondary small move-confirm" data-move-id="${item.id}">确认</button>
            </div>
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
    const response = await fetch('/api/imported-items', { cache: 'no-store' });
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
    const response = await fetch('/api/imported-items', { cache: 'no-store' });
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
    const toggle = event.target.closest('[data-toggle-folder]');
    if (toggle && !toggle.classList.contains('is-empty')) {
      const folderId = String(toggle.dataset.toggleFolder);
      const node = toggle.closest('.tree-node');
      const expanded = node ? node.classList.toggle('expanded') : false;
      toggle.setAttribute('aria-expanded', String(expanded));
      if (expanded) {
        expandedFolders.add(folderId);
      } else {
        expandedFolders.delete(folderId);
      }
      return;
    }

    const button = event.target.closest('[data-folder-id]');
    if (!button) {
      return;
    }
    currentFolderId = button.dataset.folderId;
    if (currentFolderId !== '0') {
      expandedFolders.add(String(currentFolderId));
    }
    renderFolderBreadcrumb();
    renderFolderTree(allItems);
    renderFolderItems();
  });
}

if (saveThankYouBtn) {
  saveThankYouBtn.addEventListener('click', saveThankYouSettings);
}

if (saveAnnouncementBtn) {
  saveAnnouncementBtn.addEventListener('click', saveAnnouncementSettings);
}

getAdminSecret();
loadThankYouEditor();
loadAnnouncementEditor();
fetchImportedItems();
