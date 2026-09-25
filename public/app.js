const refreshBtn = document.getElementById('refreshBtn');
const desktopGrid = document.getElementById('desktopGrid');
const resourceSearch = document.getElementById('resourceSearch');

let allItems = [];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFilteredItems(query = '') {
  const keyword = String(query || '').trim().toLowerCase();

  if (!keyword) {
    return allItems;
  }

  return allItems.filter((item) => {
    const name = String(item.name || '').toLowerCase();
    const url = String(item.url || '').toLowerCase();
    const pwd = String(item.pwd || '').toLowerCase();
    const size = String(item.size || '').toLowerCase();

    return name.includes(keyword) || url.includes(keyword) || pwd.includes(keyword) || size.includes(keyword);
  });
}

function renderDesktopItems(items) {
  if (!items || items.length === 0) {
    desktopGrid.innerHTML = '<div class="empty-state">暂无匹配资源</div>';
    return;
  }

  desktopGrid.innerHTML = items
    .map(
      (item) => `
        <div class="desktop-item" title="${escapeHtml(item.name || '未命名文件')}">
          <div class="folder-icon" aria-hidden="true"></div>
          <div class="desktop-name">${escapeHtml(item.name || '未命名文件')}</div>
        </div>
      `
    )
    .join('');

  desktopGrid.querySelectorAll('.desktop-item').forEach((node, index) => {
    node.addEventListener('click', () => {
      const item = items[index];
      if (item && item.url) {
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
    renderDesktopItems(getFilteredItems(resourceSearch ? resourceSearch.value : ''));
  } catch (error) {
    allItems = [];
    renderDesktopItems([]);
  }
}

if (resourceSearch) {
  resourceSearch.addEventListener('input', (event) => {
    renderDesktopItems(getFilteredItems(event.target.value));
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', fetchImportedItems);
}

fetchImportedItems();
