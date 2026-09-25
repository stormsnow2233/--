const refreshBtn = document.getElementById('refreshBtn');
const backFolderBtn = document.getElementById('backFolderBtn');
const desktopGrid = document.getElementById('desktopGrid');
const resourceSearch = document.getElementById('resourceSearch');
const folderBreadcrumb = document.getElementById('folderBreadcrumb');

let allItems = [];
let currentFolderId = 0;

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

function renderBreadcrumb() {
  const path = getCurrentFolderPath();
  const baseName = path.length ? path[path.length - 1].name : '根目录';
  const breadcrumbText = path.length ? `当前: ${path.map((item) => item.name).join(' / ')}` : '根目录';

  folderBreadcrumb.textContent = breadcrumbText || baseName;
}

function getVisibleItems() {
  return allItems.filter((item) => String(item.parent_id || 0) === String(currentFolderId));
}

function getFilteredItems(query = '') {
  const keyword = String(query || '').trim().toLowerCase();
  const visible = getVisibleItems();

  if (!keyword) {
    return visible;
  }

  return visible.filter((item) => {
    const name = String(item.name || '').toLowerCase();
    const url = String(item.url || '').toLowerCase();
    const pwd = String(item.pwd || '').toLowerCase();
    const size = String(item.size || '').toLowerCase();

    return name.includes(keyword) || url.includes(keyword) || pwd.includes(keyword) || size.includes(keyword);
  });
}

function renderDesktopItems(items) {
  if (!items || items.length === 0) {
    desktopGrid.innerHTML = '<div class="empty-state">当前目录为空</div>';
    return;
  }

  desktopGrid.innerHTML = items
    .map(
      (item) => `
        <div class="desktop-item ${item.is_dir ? 'is-folder' : 'is-file'}" data-item-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name || '未命名文件')}">
          <div class="folder-icon" aria-hidden="true"></div>
          <div class="desktop-name">${escapeHtml(item.name || '未命名文件')}</div>
        </div>
      `
    )
    .join('');

  desktopGrid.querySelectorAll('.desktop-item').forEach((node) => {
    node.addEventListener('click', () => {
      const itemId = node.dataset.itemId;
      const item = allItems.find((entry) => String(entry.id) === String(itemId));

      if (!item) {
        return;
      }

      if (item.is_dir) {
        currentFolderId = item.id;
        renderBreadcrumb();
        renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
        return;
      }

      if (item.url) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

async function fetchImportedItems() {
  try {
    const response = await fetch('/api/imported-items');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to load imported items');
    }

    allItems = data.items || [];
    renderBreadcrumb();
    renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
  } catch (error) {
    allItems = [];
    renderBreadcrumb();
    renderDesktopItems([]);
  }
}

if (resourceSearch) {
  resourceSearch.addEventListener('input', (event) => {
    renderDesktopItems(getFilteredItems(event.target.value));
  });
}

if (backFolderBtn) {
  backFolderBtn.addEventListener('click', () => {
    const currentFolder = getFolderById(currentFolderId);
    if (!currentFolder) {
      currentFolderId = 0;
      renderBreadcrumb();
      renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
      return;
    }

    currentFolderId = currentFolder.parent_id || 0;
    renderBreadcrumb();
    renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', fetchImportedItems);
}

fetchImportedItems();
