const refreshBtn = document.getElementById('refreshBtn');
const backFolderBtn = document.getElementById('backFolderBtn');
const desktopGrid = document.getElementById('desktopGrid');
const pagination = document.getElementById('pagination');
const resourceSearch = document.getElementById('resourceSearch');
const folderBreadcrumb = document.getElementById('folderBreadcrumb');
const thankYouButton = document.getElementById('openThankYouList');
const thankYouModal = document.getElementById('thankYouModal');
const thankYouList = document.getElementById('thankYouList');
const thankYouPagination = document.getElementById('thankYouPagination');
const closeThankYouModalBtn = document.getElementById('closeThankYouModal');
const viewButtons = document.querySelectorAll('.view-button');
const listPanel = document.querySelector('.list-panel');
const announcementModal = document.getElementById('announcementModal');
const closeAnnouncementButton = document.getElementById('closeAnnouncement');
const announcementContent = document.getElementById('announcementContent');

const THANKS_KEY = 'thank_you_links';
const ANNOUNCEMENT_KEY = 'announcement_markdown';
const ANNOUNCEMENT_MARKDOWN = `欢迎来到 **网盘资源库**。

- 资源会持续整理和更新
- 点击文件即可打开对应链接
- 如果页面没有加载内容，请稍后刷新重试

[查看使用说明](https://example.com)`;

let allItems = [];
let currentFolderId = 0;
let currentPage = 1;
const PAGE_SIZE = 13;
let thankYouPage = 1;
const THANK_YOU_PAGE_SIZE = 7;

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

  if (!folderBreadcrumb) {
    return;
  }

  const segments = [
    '<button type="button" class="breadcrumb-item breadcrumb-home" data-breadcrumb-folder="0"><i class="fa-solid fa-house"></i><span>首页</span></button>',
    ...path.map((item) => `<button type="button" class="breadcrumb-item" data-breadcrumb-folder="${escapeHtml(item.id)}"><span>${escapeHtml(item.name)}</span></button>`),
  ];

  folderBreadcrumb.innerHTML = segments.join('<span class="breadcrumb-separator" aria-hidden="true">/</span>');
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

function formatItemDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
}

function renderPagination(totalPages) {
  if (!pagination) {
    return;
  }

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    pagination.classList.remove('visible');
    return;
  }

  const pageButtons = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    return `<button type="button" class="page-button ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
  }).join('');

  pagination.innerHTML = `
    <button type="button" class="page-button page-arrow" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="上一页"><i class="fa-solid fa-chevron-left"></i></button>
    <div class="page-numbers">${pageButtons}</div>
    <button type="button" class="page-button page-arrow" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="下一页"><i class="fa-solid fa-chevron-right"></i></button>
  `;
  pagination.classList.add('visible');

  pagination.querySelectorAll('[data-page]:not([disabled])').forEach((button) => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page);
      renderDesktopItems(itemsForCurrentView);
    });
  });
}

let itemsForCurrentView = [];

function renderDesktopItems(items) {
  itemsForCurrentView = items || [];

  if (!items || items.length === 0) {
    desktopGrid.innerHTML = '<div class="empty-state">当前目录为空</div>';
    renderPagination(0);
    return;
  }

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  desktopGrid.innerHTML = pageItems
    .map((item, index) => {
      const sizeText = item.size ? String(item.size) : item.is_dir ? '目录' : '未知大小';
      const animationIndex = Math.min(index, 12);

      return `
        <div class="desktop-item ${item.is_dir ? 'is-folder' : 'is-file'}" data-item-id="${escapeHtml(item.id)}" style="--item-index: ${animationIndex};" title="${escapeHtml(item.name || '未命名文件')}">
          <div class="item-main">
            <div class="file-type-icon ${getItemIconClass(item)}" aria-hidden="true">${getItemIconHtml(item)}</div>
            <div class="desktop-name-wrap">
              <div class="desktop-name">${escapeHtml(item.name || '未命名文件')}</div>
            </div>
          </div>
          <div class="list-size">${escapeHtml(sizeText)}</div>
          <div class="list-date">${escapeHtml(formatItemDate(item.createdAt))}</div>
        </div>
      `;
    })
    .join('');
  renderPagination(totalPages);

  desktopGrid.querySelectorAll('.desktop-item').forEach((node) => {
    node.addEventListener('click', () => {
      const itemId = node.dataset.itemId;
      const item = allItems.find((entry) => String(entry.id) === String(itemId));

      if (!item) {
        return;
      }

      if (item.is_dir) {
        currentFolderId = item.id;
        currentPage = 1;
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
    currentPage = 1;
    renderBreadcrumb();
    renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
  } catch (error) {
    allItems = [];
    currentPage = 1;
    renderBreadcrumb();
    renderDesktopItems([]);
  }
}

if (resourceSearch) {
  resourceSearch.addEventListener('input', (event) => {
    currentPage = 1;
    renderDesktopItems(getFilteredItems(event.target.value));
  });
}

if (folderBreadcrumb) {
  folderBreadcrumb.addEventListener('click', (event) => {
    const button = event.target.closest('[data-breadcrumb-folder]');
    if (!button) {
      return;
    }

    currentFolderId = button.dataset.breadcrumbFolder || 0;
    currentPage = 1;
    renderBreadcrumb();
    renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
  });
}

if (backFolderBtn) {
  backFolderBtn.addEventListener('click', () => {
    const currentFolder = getFolderById(currentFolderId);
    if (!currentFolder) {
      currentFolderId = 0;
      currentPage = 1;
      renderBreadcrumb();
      renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
      return;
    }

    currentFolderId = currentFolder.parent_id || 0;
    currentPage = 1;
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
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.label) : [];
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
    if (thankYouPagination) {
      thankYouPagination.innerHTML = '';
      thankYouPagination.classList.remove('visible');
    }
    return;
  }

  const totalPages = Math.ceil(links.length / THANK_YOU_PAGE_SIZE);
  thankYouPage = Math.min(Math.max(thankYouPage, 1), totalPages);
  const pageLinks = links.slice((thankYouPage - 1) * THANK_YOU_PAGE_SIZE, thankYouPage * THANK_YOU_PAGE_SIZE);

  thankYouList.innerHTML = pageLinks
    .map((item) => {
      if (item.url) {
        return `
          <a class="thank-you-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(item.label)}
          </a>
        `;
      }

      return `
        <div class="thank-you-item">
          ${escapeHtml(item.label)}
        </div>
      `;
    })
    .join('');

  if (!thankYouPagination) {
    return;
  }

  if (totalPages <= 1) {
    thankYouPagination.innerHTML = '';
    thankYouPagination.classList.remove('visible');
    return;
  }

  thankYouPagination.innerHTML = `
    <button type="button" class="thank-you-page-button" data-thank-you-page="${thankYouPage - 1}" ${thankYouPage === 1 ? 'disabled' : ''} aria-label="上一页"><i class="fa-solid fa-chevron-left"></i></button>
    <span>${thankYouPage} / ${totalPages}</span>
    <button type="button" class="thank-you-page-button" data-thank-you-page="${thankYouPage + 1}" ${thankYouPage === totalPages ? 'disabled' : ''} aria-label="下一页"><i class="fa-solid fa-chevron-right"></i></button>
  `;
  thankYouPagination.classList.add('visible');
  thankYouPagination.querySelectorAll('[data-thank-you-page]:not([disabled])').forEach((button) => {
    button.addEventListener('click', () => {
      thankYouPage = Number(button.dataset.thankYouPage);
      renderThankYouList();
    });
  });
}

function openThankYouModal() {
  if (!thankYouModal) {
    return;
  }

  thankYouPage = 1;
  renderThankYouList();
  thankYouModal.classList.remove('is-opening');
  thankYouModal.classList.remove('hidden');
  thankYouModal.setAttribute('aria-hidden', 'false');
  void thankYouModal.offsetWidth;
  requestAnimationFrame(() => {
    thankYouModal.classList.add('is-opening');
  });
}

function closeThankYouModal() {
  if (!thankYouModal) {
    return;
  }

  thankYouModal.classList.add('hidden');
  thankYouModal.classList.remove('is-opening');
  thankYouModal.setAttribute('aria-hidden', 'true');
}

function renderAnnouncementMarkdown(markdown) {
  if (!announcementContent) {
    return;
  }

  const inlineMarkdown = (value) => value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  const lines = escapeHtml(markdown).split('\n');
  const html = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  lines.forEach((line) => {
    if (/^[-*]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`);
      return;
    }

    closeList();
    if (!line.trim()) {
      return;
    }
    if (/^###\s+/.test(line)) {
      html.push(`<h4>${inlineMarkdown(line.replace(/^###\s+/, ''))}</h4>`);
    } else if (/^##\s+/.test(line)) {
      html.push(`<h3>${inlineMarkdown(line.replace(/^##\s+/, ''))}</h3>`);
    } else if (/^#\s+/.test(line)) {
      html.push(`<h2>${inlineMarkdown(line.replace(/^#\s+/, ''))}</h2>`);
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  });

  closeList();
  announcementContent.innerHTML = html.join('');
}

function getAnnouncementMarkdown() {
  return localStorage.getItem(ANNOUNCEMENT_KEY) || ANNOUNCEMENT_MARKDOWN;
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

function setAnnouncementVisible(visible) {
  if (!announcementModal) {
    return;
  }

  announcementModal.classList.toggle('hidden', !visible);
  announcementModal.setAttribute('aria-hidden', String(!visible));
  if (visible && closeAnnouncementButton) {
    closeAnnouncementButton.focus();
  }
}

if (closeAnnouncementButton) {
  closeAnnouncementButton.addEventListener('click', () => setAnnouncementVisible(false));
}

if (announcementModal) {
  announcementModal.addEventListener('click', (event) => {
    if (event.target === announcementModal) {
      setAnnouncementVisible(false);
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setAnnouncementVisible(false);
    closeThankYouModal();
  }
});

viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view || 'list';
    viewButtons.forEach((item) => item.classList.toggle('active', item === button));
    if (listPanel) {
      listPanel.classList.toggle('grid-mode', view === 'grid');
    }
  });
});

if (refreshBtn) {
  refreshBtn.addEventListener('click', fetchImportedItems);
}

fetchImportedItems();
renderAnnouncementMarkdown(getAnnouncementMarkdown());
setAnnouncementVisible(true);
