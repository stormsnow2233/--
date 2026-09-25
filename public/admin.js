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
const batchBar = document.getElementById('batchBar');
const batchCount = document.getElementById('batchCount');
const batchToggleAll = document.getElementById('batchToggleAll');
const batchSelectAll = document.getElementById('batchSelectAll');
const batchClear = document.getElementById('batchClear');
const batchDelete = document.getElementById('batchDelete');
const batchDeleteModal = document.getElementById('batchDeleteModal');
const batchDeleteSummary = document.getElementById('batchDeleteSummary');
const batchDeleteList = document.getElementById('batchDeleteList');
const batchDeleteCancel = document.getElementById('batchDeleteCancel');
const batchDeleteConfirm = document.getElementById('batchDeleteConfirm');

/* Ids ticked in the file table. Kept in a Set so the selection survives a
   re-render trigger and can be diffed cheaply. */
const selectedItemIds = new Set();

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

/* Entrance choreography.
   The panels, the folder tree and the first batch of table rows animate in as a
   staggered group, but only during a short window after first paint. The tree
   and the table are re-rendered on every directory change, so without this gate
   they would re-stage themselves each time — the same flicker the public page
   used to have. CSS does all the animating; this only decides when it is
   allowed to run. */
const adminShell = document.querySelector('.admin-shell');

if (adminShell) {
  document.querySelectorAll('.admin-main > .panel').forEach((panel, index) => {
    panel.style.setProperty('--panel-index', String(index));
  });

  const adminReducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!adminReducedMotion) {
    adminShell.classList.add('admin-boot');
    window.setTimeout(() => adminShell.classList.remove('admin-boot'), 1200);
  }
}

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

function buildFolderTreeHtml(items, parentId = 0, counter = { i: 0 }) {
  const children = items.filter((item) => String(item.parent_id || 0) === String(parentId) && item.is_dir);

  return children
    .map((item) => {
      const nestedItems = items.filter((child) => String(child.parent_id || 0) === String(item.id) && child.is_dir);
      const hasChildren = nestedItems.length > 0;
      const expanded = expandedFolders.has(String(item.id)) || isFolderInCurrentPath(item.id);
      const activeClass = String(item.id) === String(currentFolderId) ? 'active' : '';
      const treeIndex = Math.min(counter.i, 12);
      counter.i += 1;

      return `
        <div class="tree-node ${expanded ? 'expanded' : ''}">
          <div class="tree-row">
            <button type="button" class="tree-toggle ${hasChildren ? '' : 'is-empty'}" data-toggle-folder="${item.id}" aria-expanded="${expanded}" aria-label="展开或收起 ${escapeHtml(item.name)}">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button type="button" class="folder-tree-item ${activeClass}" data-folder-id="${item.id}" style="--tree-index: ${treeIndex};">
              <i class="fa-solid fa-folder"></i>
              <span>${escapeHtml(item.name)}</span>
            </button>
          </div>
          <div class="tree-children">${buildFolderTreeHtml(items, item.id, counter)}</div>
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
      <button type="button" class="folder-tree-item ${rootActive}" data-folder-id="0" style="--tree-index: 0;">
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
    folderItemsBody.innerHTML = '<tr><td colspan="5" class="empty">当前目录为空</td></tr>';
    // Nothing is selectable here, so a stale selection would leave the batch bar
    // floating above an empty table.
    selectedItemIds.clear();
    syncBatchUi();
    return;
  }

  folderItemsBody.innerHTML = items
    .map((item, rowIndex) => {
      const typeLabel = item.is_dir ? '文件夹' : '文件';
      const detailText = item.is_dir ? '目录' : item.url || item.size || '—';
      const checked = selectedItemIds.has(String(item.id)) ? ' checked' : '';
      return `
        <tr style="--row-index: ${Math.min(rowIndex, 12)};">
          <td class="col-check">
            <input type="checkbox" data-select-id="${escapeHtml(item.id)}"${checked} aria-label="选择 ${escapeHtml(item.name || '未命名文件')}" />
          </td>
          <td>${escapeHtml(item.name || '未命名文件')}</td>
          <td>${typeLabel}</td>
          <td>${escapeHtml(detailText)}</td>
          <td>
            <div class="row-actions">
              ${item.is_dir ? `<button type="button" class="secondary small" data-enter-id="${item.id}">进入</button><button type="button" class="secondary small" data-rename-id="${item.id}">重命名</button>` : `<a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer" class="tiny-link">打开</a>`}
              <button type="button" class="secondary small move-toggle" data-move-toggle aria-expanded="false" aria-label="移动 ${escapeHtml(item.name || '资源')}">
                <i class="fa-solid fa-arrow-right-arrow-left" aria-hidden="true"></i> 移动
              </button>
              <button type="button" class="danger small" data-delete-id="${item.id}">删除</button>
            </div>
            <div class="move-control">
              <label class="move-label">移动到</label>
              <select class="move-select" data-move-id="${item.id}" aria-label="移动 ${escapeHtml(item.name || '资源')} 到">
                <option value="0">根目录</option>
                ${buildFolderOptions(item.id)}
              </select>
              <button type="button" class="secondary small" data-move-cancel>收起</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Drop ids that are no longer on screen (deleted elsewhere, or folder changed)
  const visibleIds = new Set(items.map((item) => String(item.id)));
  [...selectedItemIds].forEach((id) => {
    if (!visibleIds.has(id)) {
      selectedItemIds.delete(id);
    }
  });
  syncBatchUi();

  folderItemsBody.querySelectorAll('[data-select-id]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = String(box.dataset.selectId);
      if (box.checked) {
        selectedItemIds.add(id);
      } else {
        selectedItemIds.delete(id);
      }
      syncBatchUi();
    });
  });

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

  folderItemsBody.querySelectorAll('[data-rename-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemId = button.dataset.renameId;
      const item = allItems.find((entry) => String(entry.id) === String(itemId));
      const nextName = window.prompt('请输入新的文件夹名称', item?.name || '');

      if (nextName === null || !nextName.trim()) {
        return;
      }

      const adminSecret = getAdminSecret();
      const response = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName.trim(), authKey: adminSecret }),
      });
      const data = await response.json();
      if (!response.ok) {
        showMessage(data.message || '重命名失败', 'error');
        return;
      }
      showMessage('文件夹重命名成功', 'success');
      await refreshAllData();
    });
  });

  folderItemsBody.querySelectorAll('.move-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const itemId = select.dataset.moveId;
      const targetParent = select.value;
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

  // "移动" reveals the folder picker for this row only, and only on demand.
  // The picker stays in normal flow (rather than a floating popover) because
  // .table-wrap scrolls horizontally and would clip anything absolute.
  folderItemsBody.querySelectorAll('[data-move-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      if (!row) {
        return;
      }
      const control = row.querySelector('.move-control');
      if (!control) {
        return;
      }
      const opening = !control.classList.contains('is-open');
      closeOpenMoveControls(control);
      control.classList.toggle('is-open', opening);
      button.setAttribute('aria-expanded', String(opening));
      if (opening) {
        const select = control.querySelector('.move-select');
        if (select) {
          select.focus();
        }
      }
    });
  });

  folderItemsBody.querySelectorAll('[data-move-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
      const control = button.closest('.move-control');
      if (control) {
        closeOpenMoveControls();
      }
    });
  });
}

/* Only one row's picker open at a time, so the table cannot end up with a
   stack of expanded panels. Pass an element to keep it open. */
function closeOpenMoveControls(keep) {
  folderItemsBody.querySelectorAll('.move-control.is-open').forEach((control) => {
    if (control === keep) {
      return;
    }
    control.classList.remove('is-open');
    const row = control.closest('tr');
    const toggle = row ? row.querySelector('[data-move-toggle]') : null;
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ---------- batch selection ---------- */

/* Rows currently rendered, so "全选本页" means what it says. */
function visibleFolderItems() {
  const ids = [...folderItemsBody.querySelectorAll('[data-select-id]')].map((box) => String(box.dataset.selectId));
  return ids.map((id) => allItems.find((item) => String(item.id) === id)).filter(Boolean);
}

function syncBatchUi() {
  if (!batchBar) {
    return;
  }

  const boxes = [...folderItemsBody.querySelectorAll('[data-select-id]')];
  const selectedOnPage = boxes.filter((box) => box.checked).length;
  const total = selectedItemIds.size;

  batchBar.classList.toggle('hidden', total === 0);
  if (batchCount) {
    batchCount.textContent = `已选 ${total} 项`;
  }

  if (batchToggleAll) {
    batchToggleAll.checked = boxes.length > 0 && selectedOnPage === boxes.length;
    // A partial selection should not read as "all".
    batchToggleAll.indeterminate = selectedOnPage > 0 && selectedOnPage < boxes.length;
    batchToggleAll.disabled = boxes.length === 0;
  }

  if (batchDelete) {
    batchDelete.disabled = total === 0;
  }
}

function setAllOnPage(checked) {
  folderItemsBody.querySelectorAll('[data-select-id]').forEach((box) => {
    box.checked = checked;
    const id = String(box.dataset.selectId);
    if (checked) {
      selectedItemIds.add(id);
    } else {
      selectedItemIds.delete(id);
    }
  });
  syncBatchUi();
}

function openBatchDeleteModal() {
  if (!batchDeleteModal || selectedItemIds.size === 0) {
    return;
  }

  const chosen = allItems.filter((item) => selectedItemIds.has(String(item.id)));
  const folders = chosen.filter((item) => item.is_dir).length;

  if (batchDeleteSummary) {
    batchDeleteSummary.textContent = folders
      ? `共 ${chosen.length} 项（其中 ${folders} 个文件夹，会连同内容一起删除）`
      : `共 ${chosen.length} 项`;
  }

  if (batchDeleteList) {
    const names = chosen.slice(0, 8).map((item) => item.name || '未命名文件');
    const extra = chosen.length > names.length ? `<li class="subtle">…还有 ${chosen.length - names.length} 项</li>` : '';
    batchDeleteList.innerHTML = names.map((name) => `<li>${escapeHtml(name)}</li>`).join('') + extra;
  }

  batchDeleteModal.classList.add('visible');
  batchDeleteModal.setAttribute('aria-hidden', 'false');
}

function closeBatchDeleteModal() {
  if (!batchDeleteModal) {
    return;
  }
  batchDeleteModal.classList.remove('visible');
  batchDeleteModal.setAttribute('aria-hidden', 'true');
}

async function runBatchDelete() {
  const ids = [...selectedItemIds];
  if (!ids.length) {
    return;
  }

  const adminSecret = getAdminSecret();
  if (batchDeleteConfirm) {
    batchDeleteConfirm.disabled = true;
    batchDeleteConfirm.textContent = '删除中…';
  }

  try {
    const response = await fetch('/api/items/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, authKey: adminSecret }),
    });
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || '批量删除失败', 'error');
      return;
    }

    selectedItemIds.clear();
    closeBatchDeleteModal();
    showMessage(data.message || `已删除 ${data.removedCount} 项`, 'success');
    await refreshAllData();
  } catch (error) {
    showMessage('批量删除失败，请重试', 'error');
  } finally {
    if (batchDeleteConfirm) {
      batchDeleteConfirm.disabled = false;
      batchDeleteConfirm.textContent = '确认删除';
    }
  }
}

if (batchToggleAll) {
  batchToggleAll.addEventListener('change', () => setAllOnPage(batchToggleAll.checked));
}

if (batchSelectAll) {
  batchSelectAll.addEventListener('click', () => setAllOnPage(true));
}

if (batchClear) {
  batchClear.addEventListener('click', () => setAllOnPage(false));
}

if (batchDelete) {
  batchDelete.addEventListener('click', openBatchDeleteModal);
}

if (batchDeleteCancel) {
  batchDeleteCancel.addEventListener('click', closeBatchDeleteModal);
}

if (batchDeleteConfirm) {
  batchDeleteConfirm.addEventListener('click', runBatchDelete);
}

if (batchDeleteModal) {
  batchDeleteModal.addEventListener('click', (event) => {
    if (event.target === batchDeleteModal) {
      closeBatchDeleteModal();
    }
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
    .map((item, rowIndex) => `
      <tr style="--row-index: ${Math.min(rowIndex, 12)};">
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
          <td><span class="drive-tag drive-${escapeHtml(item.drive || 'other')}">${escapeHtml(item.driveLabel || detectDrive(item.url).label)}</span></td>
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

/* Reasons that mean "this share is not a single file", so it must not be
   imported. Anything else (network hiccup, unsupported host, private link) is
   treated as "could not verify" and the row is kept with whatever name the
   parser produced. */
const NOT_SINGLE_FILE_REASONS = new Set(['folder', 'multi-entry']);

/* Why a link was dropped, in words the operator can act on. */
const REJECTION_TEXT = {
  folder: '是一个文件夹',
  'multi-entry': '包含多个文件',
  'bad-code': '提取码不正确',
  'needs-code': '缺少提取码（该分享需要提取码才能校验）',
};

/* Fill in the real file name / size for links whose page exposes it, and decide
   whether each link is actually a single-file share.

   Returns { filled, rejected: [{ item, reason }] }. Rejects only on evidence —
   a definitive "this is a folder / holds several entries" from the provider, or
   a bad/missing extraction code that makes the check impossible. A provider that
   cannot be read at all (OneDrive's login wall, an unsupported host) is left
   alone rather than guessing. */
async function enrichWithMetadata(items) {
  const targets = (items || []).filter((item) => item && item.url);

  if (!targets.length) {
    return { filled: 0, rejected: [] };
  }

  let filled = 0;
  const rejected = [];

  await Promise.all(
    targets.map(async (item) => {
      try {
        // The extraction code is passed along because Baidu's file list sits
        // behind a /share/verify call; providers that don't need it ignore it.
        const query = `url=${encodeURIComponent(item.url)}&code=${encodeURIComponent(item.pwd || '')}`;
        const res = await fetch(`/api/metadata?${query}`, { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const meta = await res.json();
        if (!meta) {
          return;
        }

        if (NOT_SINGLE_FILE_REASONS.has(meta.reason)) {
          rejected.push({ item, reason: meta.reason });
          return;
        }

        // A wrong or absent code only matters for providers that gate the file
        // list behind it — without the code the link cannot be verified, so it
        // is refused rather than imported on trust.
        if (meta.reason === 'bad-code' || meta.reason === 'needs-code') {
          rejected.push({ item, reason: meta.reason });
          return;
        }

        if (meta.name) {
          item.name = meta.name;
          filled += 1;
        }
        if (meta.size && !item.size) {
          item.size = meta.size;
        }
      } catch (error) {
        /* keep whatever the parser produced */
      }
    })
  );

  return { filled, rejected };
}

async function handleParseBatch() {
  const items = parseBatchInput(importInput.value || '');

  if (!items.length) {
    showMessage('未识别到有效的分享链接，请重新粘贴文本。', 'error');
    renderParsedItems([]);
    return;
  }

  renderParsedItems(items);
  const summary = typeof summarizeDrives === 'function' ? summarizeDrives(items) : '';
  showMessage(
    `已识别 ${items.length} 条资源${summary ? `（${summary}）` : ''}，正在校验是否为单文件分享…`,
    'success'
  );

  const { filled, rejected } = await enrichWithMetadata(items);

  // Drop everything that turned out not to be a single file.
  const kept = items.filter((item) => !rejected.some((r) => r.item === item));

  if (rejected.length) {
    renderParsedItems(kept);

    const detail = rejected
      .map((r) => `「${r.item.name || r.item.url}」${REJECTION_TEXT[r.reason] || r.reason}`)
      .join('；');

    const tail = kept.length
      ? `；其余 ${kept.length} 条已保留${filled ? `（${filled} 条已自动补全文件名）` : ''}。`
      : '。';

    showMessage(`已忽略 ${rejected.length} 条非单文件分享：${detail}${tail}`, 'error');
    return;
  }

  if (filled > 0) {
    renderParsedItems(items);
    showMessage(`已识别 ${items.length} 条资源，其中 ${filled} 条已自动补全文件名。`, 'success');
  } else {
    showMessage(`已识别 ${items.length} 条资源${summary ? `（${summary}）` : ''}，可继续微调。`, 'success');
  }
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

// Escape closes whichever dialog is open, or collapses an open move picker.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  if (batchDeleteModal && batchDeleteModal.classList.contains('visible')) {
    closeBatchDeleteModal();
    return;
  }
  if (createFolderModal && createFolderModal.classList.contains('visible')) {
    closeCreateFolderModal();
    return;
  }
  if (folderItemsBody && folderItemsBody.querySelector('.move-control.is-open')) {
    closeOpenMoveControls();
  }
});

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
