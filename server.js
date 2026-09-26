const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const importedItemsFile = path.join(dataDir, 'imported-items.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

if (!process.env.ADMIN_SECRET) {
  console.warn('[web-disk] ⚠️  ADMIN_SECRET 未通过环境变量设置，当前使用默认值（仅适用于本地开发，请勿用于生产）');
}

fs.mkdirSync(dataDir, { recursive: true });

/* ---------- write lock ---------------------------------------------------
   Serialises every read-modify-write cycle that touches imported-items.json.
   All current I/O is synchronous so Node's single-threaded event loop already
   prevents interleaving within a single tick — but an explicit queue makes the
   intent clear and protects if the code ever switches to async file I/O.

   Each withWriteLock(fn) call:
     - waits for all previous fn calls to finish before running fn
     - resolves/rejects with whatever fn returns or throws
     - never blocks the queue on error (the tail promise always resolves)    */
let _writeQueue = Promise.resolve();

function withWriteLock(fn) {
  const step = _writeQueue.then(() => fn());
  // The tail must never reject; a failed step must not stall the whole queue.
  _writeQueue = step.then(() => {}, () => {});
  return step;
}
/* ------------------------------------------------------------------------ */

function writeImportedItems(items) {
  fs.writeFileSync(importedItemsFile, JSON.stringify(items, null, 2), 'utf-8');
}

function readImportedItems() {
  if (!fs.existsSync(importedItemsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(importedItemsFile, 'utf-8');
    // A UTF-8 BOM (Windows 记事本 / PowerShell 5 的 Set-Content -Encoding UTF8 默认都会写)
    // makes JSON.parse throw. Silently returning [] here would make the whole
    // web disk look empty with no explanation, so strip it first.
    const parsed = JSON.parse(content.replace(/^\uFEFF/, ''));
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch (error) {
    // Still fail soft (a broken file must not take the site down), but say so
    // instead of pretending there is simply no data.
    console.warn(`[web-disk] 读取 ${path.basename(importedItemsFile)} 失败，按空列表处理：${error.message}`);
    return [];
  }
}

function normalizeParentId(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const stringValue = String(value).trim();
  return /^\d+$/.test(stringValue) ? Number(stringValue) : stringValue;
}

function normalizeItem(item) {
  const record = item || {};
  return {
    id: String(record.id || `item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    parent_id: normalizeParentId(record.parent_id),
    name: String(record.name || '未命名文件').trim() || '未命名文件',
    is_dir: Boolean(record.is_dir || record.kind === 'folder'),
    kind: record.kind || (record.is_dir ? 'folder' : 'file'),
    url: String(record.url || '').trim(),
    pwd: String(record.pwd || '').trim(),
    size: String(record.size || '').trim(),
    storage_name: record.storage_name || '',
    createdAt: record.createdAt || new Date().toISOString(),
  };
}

function createId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildTree(items, parentId = 0) {
  const children = items
    .filter((item) => String(item.parent_id || 0) === String(parentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'))
    .map((item) => ({
      ...item,
      children: buildTree(items, item.id),
    }));

  return children;
}

function collectDescendantIds(items, itemId, acc = new Set()) {
  const current = items.filter((entry) => String(entry.parent_id || 0) === String(itemId));
  current.forEach((entry) => {
    if (!acc.has(String(entry.id))) {
      acc.add(String(entry.id));
      collectDescendantIds(items, entry.id, acc);
    }
  });
  return acc;
}

/* Centralised auth check. An absent key is treated the same as a wrong key —
   the old pattern (authKey && authKey !== SECRET) silently let requests through
   when authKey was omitted entirely. */
function requireAdminSecret(authKey) {
  return Boolean(authKey) && authKey === ADMIN_SECRET;
}

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.json());

/* Asset versioning.
   Headers alone are not enough on phones: some mobile and in-app browsers
   (微信 / QQ / UC 等) keep their own copy of an asset referenced by a bare URL
   and never revalidate it, so the page keeps rendering an old stylesheet even
   though the server says no-store. Stamping the mtime onto the asset URL makes
   the URL itself change whenever the file does, which defeats that cache. */
function fileVersion(relativePath) {
  try {
    const full = path.join(__dirname, 'public', relativePath);
    return String(Math.trunc(fs.statSync(full).mtimeMs));
  } catch (error) {
    return String(Date.now());
  }
}

function renderHtmlWithVersions(html) {
  const versions = {
    '/styles.css': fileVersion('styles.css'),
    '/app.js': fileVersion('app.js'),
    '/admin.js': fileVersion('admin.js'),
    '/parser.js': fileVersion('parser.js'),
  };

  return html.replace(
    /(href|src)="(\/(?:styles\.css|app\.js|admin\.js|parser\.js))"/g,
    (match, attr, url) => `${attr}="${url}?v=${versions[url]}"`
  );
}

function sendVersionedHtml(res, filename) {
  try {
    const html = renderHtmlWithVersions(fs.readFileSync(path.join(__dirname, 'public', filename), 'utf-8'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).send('页面读取失败');
  }
}

// Registered before the static middleware, and static is told not to serve
// index.html itself, so these versioned routes are the ones that win.
app.get(['/', '/index.html'], (req, res) => sendVersionedHtml(res, 'index.html'));
app.get(['/admin', '/admin.html'], (req, res) => sendVersionedHtml(res, 'admin.html'));

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/* Share-link metadata (best effort). Reuses the same allowlisted module the
   Cloudflare Function uses, so both back ends behave identically.
   Dynamic import because that module is ESM and this file is CommonJS.
   Note: outbound Google access from Node needs a proxy on some networks —
   set HTTPS_PROXY (plus NODE_USE_ENV_PROXY=1 on Node >= 24). */
app.get('/api/metadata', async (req, res) => {
  const url = String(req.query.url || '');
  const code = String(req.query.code || '');
  if (!url) {
    return res.status(400).json({ name: '', size: '', provider: null, reason: 'missing-url' });
  }

  try {
    const { fetchShareMetadata } = await import('./functions/_shared/metadata.js');
    const result = await fetchShareMetadata(url, code);
    return res.json(result);
  } catch (error) {
    return res.json({
      name: '',
      size: '',
      provider: null,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/imported-items', (req, res) => {
  const items = readImportedItems();
  res.json({
    items,
    folders: items.filter((item) => item.is_dir),
    tree: buildTree(items, 0),
  });
});

app.post('/api/folders', async (req, res) => {
  const { name, parent_id = 0, authKey } = req.body || {};

  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const folderName = String(name || '').trim();
  if (!folderName) {
    return res.status(400).json({ success: false, message: '文件夹名称不能为空' });
  }

  const normalizedParentId = normalizeParentId(parent_id);

  try {
    const folder = await withWriteLock(() => {
      const items = readImportedItems();
      const alreadyExists = items.some(
        (item) =>
          String(item.parent_id || 0) === String(normalizedParentId) &&
          item.is_dir &&
          String(item.name || '').trim().toLowerCase() === folderName.toLowerCase()
      );
      if (alreadyExists) {
        const err = new Error('同一目录下已存在同名文件夹');
        err.statusCode = 409;
        throw err;
      }
      const newFolder = normalizeItem({
        id: createId('folder'),
        parent_id: normalizedParentId,
        name: folderName,
        is_dir: true,
        kind: 'folder',
        createdAt: new Date().toISOString(),
      });
      items.push(newFolder);
      writeImportedItems(items);
      return newFolder;
    });
    res.status(201).json({ success: true, folder });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

app.post('/api/items/move', async (req, res) => {
  const { item_id, parent_id = 0, authKey } = req.body || {};

  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const targetParentId = normalizeParentId(parent_id);

  try {
    const item = await withWriteLock(() => {
      const items = readImportedItems();
      const target = items.find((entry) => String(entry.id) === String(item_id));

      if (!target) {
        const err = new Error('目标数据不存在');
        err.statusCode = 404;
        throw err;
      }

      if (String(target.id) === String(targetParentId)) {
        const err = new Error('不能移动到自身');
        err.statusCode = 400;
        throw err;
      }

      if (target.is_dir) {
        const descendantIds = collectDescendantIds(items, target.id);
        if (descendantIds.has(String(targetParentId))) {
          const err = new Error('不能将文件夹移动到其子目录中');
          err.statusCode = 400;
          throw err;
        }
      }

      target.parent_id = targetParentId;
      writeImportedItems(items);
      return target;
    });
    res.json({ success: true, item });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

app.post('/api/admin', async (req, res) => {
  const { action, authKey, items = [], parent_id = 0 } = req.body || {};

  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  if (action === 'batch_import') {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '无有效文件数据' });
    }

    const normalized = items
      .filter((item) => item && (item.url || item.name))
      .map((item, index) => ({
        id: item.id || `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        parent_id: normalizeParentId(parent_id),
        name: String(item.name || '未命名文件').trim() || '未命名文件',
        is_dir: Number(Boolean(item.is_dir)),
        kind: item.is_dir ? 'folder' : 'file',
        url: String(item.url || '').trim(),
        pwd: String(item.pwd || '').trim(),
        size: String(item.size || '').trim(),
        createdAt: new Date().toISOString(),
      }));

    if (normalized.length === 0) {
      return res.status(400).json({ success: false, message: '无有效文件数据' });
    }

    try {
      await withWriteLock(() => {
        const existing = readImportedItems();
        writeImportedItems([...existing, ...normalized]);
      });
      res.json({
        success: true,
        count: normalized.length,
        message: `成功导入 ${normalized.length} 个资源`,
      });
    } catch (error) {
      res.status(500).json({ success: false, message: '批量导入失败', error: error.message });
    }
    return;
  }

  return res.status(400).json({ success: false, message: '未知指令' });
});

/* Batch delete. One request for N ids instead of N requests: reading and
   writing the file once also means a partial failure cannot leave the data in a
   half-updated state between calls. Deleting a folder still removes its whole
   subtree. Unknown ids are reported rather than failing the whole batch. */
app.post('/api/items/batch-delete', async (req, res) => {
  const { authKey, ids } = req.body || {};
  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: '未选择要删除的项' });
  }

  try {
    const result = await withWriteLock(() => {
      const items = readImportedItems();
      const wanted = new Set(ids.map((id) => String(id)));
      const removeIds = new Set();
      const notFound = [];

      for (const id of wanted) {
        const target = items.find((entry) => String(entry.id) === id);
        if (!target) {
          notFound.push(id);
          continue;
        }
        removeIds.add(String(target.id));
        if (target.is_dir) {
          collectDescendantIds(items, target.id, removeIds);
        }
      }

      if (removeIds.size === 0) {
        const err = new Error('所选数据已不存在');
        err.statusCode = 404;
        err.notFound = notFound;
        throw err;
      }

      const remaining = items.filter((entry) => !removeIds.has(String(entry.id)));
      writeImportedItems(remaining);
      return { wantedSize: wanted.size, removeIds: [...removeIds], notFound };
    });

    res.json({
      success: true,
      requested: result.wantedSize,
      removed: result.removeIds,
      removedCount: result.removeIds.length,
      notFound: result.notFound,
      message: `已删除 ${result.removeIds.length} 项`,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message,
      notFound: error.notFound,
    });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const { authKey } = req.body || {};
  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const { id } = req.params;

  try {
    const removed = await withWriteLock(() => {
      const items = readImportedItems();
      const target = items.find((entry) => String(entry.id) === String(id));

      if (!target) {
        const err = new Error('数据不存在');
        err.statusCode = 404;
        throw err;
      }

      const removeIds = new Set([String(target.id)]);
      if (target.is_dir) {
        collectDescendantIds(items, target.id, removeIds);
      }

      const remaining = items.filter((entry) => !removeIds.has(String(entry.id)));
      writeImportedItems(remaining);
      return [...removeIds];
    });
    res.json({ success: true, removed, message: '删除成功' });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/* Rename a file or a folder. This route was missing entirely — the admin has
   been calling PATCH all along, so renaming only ever worked on Cloudflare and
   silently 404'd locally. Nothing here is folder-specific. */
app.patch('/api/items/:id', async (req, res) => {
  const { authKey, name } = req.body || {};
  if (!requireAdminSecret(authKey)) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const nextName = String(name || '').trim();
  if (!nextName) {
    return res.status(400).json({ success: false, message: '名称不能为空' });
  }

  const { id } = req.params;

  try {
    const updated = await withWriteLock(() => {
      const items = readImportedItems();
      const target = items.find((entry) => String(entry.id) === String(id));

      if (!target) {
        const err = new Error('数据不存在');
        err.statusCode = 404;
        throw err;
      }

      target.name = nextName;
      writeImportedItems(items);
      return target;
    });

    res.json({
      success: true,
      message: `${updated.is_dir ? '文件夹' : '文件'}重命名成功`,
      name: nextName,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, message: error.message });
  }
});

/* SPA fallback for any other path. The versioned / and /admin routes above
   already handled those two, so this stays a plain sendFile. */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`网盘服务启动成功: http://localhost:${PORT}`);
});
