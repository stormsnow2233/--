const refreshBtn = document.getElementById('refreshBtn');
const backFolderBtn = document.getElementById('backFolderBtn');
const desktopGrid = document.getElementById('desktopGrid');
const resourceSearch = document.getElementById('resourceSearch');
const folderBreadcrumb = document.getElementById('folderBreadcrumb');
const thankYouButton = document.getElementById('openThankYouList');
const thankYouModal = document.getElementById('thankYouModal');
const thankYouList = document.getElementById('thankYouList');
const closeThankYouModalBtn = document.getElementById('closeThankYouModal');

const THANKS_KEY = 'thank_you_links';

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

function getItemIconClass(item) {
  if (item && item.is_dir) {
    return 'icon-folder';
  }

  const fileName = String(item?.name || '').toLowerCase();
  const ext = fileName.includes('.') ? fileName.split('.').pop() : '';

  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'apk'].includes(ext)) {
    return 'icon-archive';
  }

  if (['iso', 'img', 'bin', 'cue', 'dmg'].includes(ext)) {
    return 'icon-disk';
  }

  return 'icon-file';
}

function getItemIconHtml(item) {
  const iconClass = getItemIconClass(item);

  if (iconClass === 'icon-folder') {
    return '<i class="fa-solid fa-folder"></i>';
  }

  if (iconClass === 'icon-archive') {
    return '<i class="fa-solid fa-file-zipper"></i>';
  }

  if (iconClass === 'icon-disk') {
    return '<i class="fa-solid fa-compact-disc"></i>';
  }

  return '<i class="fa-regular fa-file-lines"></i>';
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
          <div class="file-type-icon ${getItemIconClass(item)}" aria-hidden="true">${getItemIconHtml(item)}</div>
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
    const response = await fetch('/api/imported-items', { cache: 'no-store' });
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

function getThankYouLinks() {
  try {
    const raw = localStorage.getItem(THANKS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.label && item.url) : [];
  } catch (error) {
    return [];
  }
}

function renderThankYouList() {
  if (!thankYouList) {
    return;
  }

  const links = getThankYouLinks();

  if (!links.length) {
    thankYouList.innerHTML = '<p class="thank-you-empty">还没有设置感谢名单</p>';
    return;
  }

  thankYouList.innerHTML = links
    .map(
      (item) => `
        <a class="thank-you-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(item.label)}
        </a>
      `
    )
    .join('');
}

function openThankYouModal() {
  if (!thankYouModal) {
    return;
  }

  renderThankYouList();
  thankYouModal.classList.remove('hidden');
  thankYouModal.setAttribute('aria-hidden', 'false');
}

function closeThankYouModal() {
  if (!thankYouModal) {
    return;
  }

  thankYouModal.classList.add('hidden');
  thankYouModal.setAttribute('aria-hidden', 'true');
}

if (thankYouButton) {
  thankYouButton.addEventListener('click', openThankYouModal);
}

if (closeThankYouModalBtn) {
  closeThankYouModalBtn.addEventListener('click', closeThankYouModal);
}

if (thankYouModal) {
  thankYouModal.addEventListener('click', (event) => {
    if (event.target === thankYouModal) {
      closeThankYouModal();
    }
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', fetchImportedItems);
}

fetchImportedItems();
