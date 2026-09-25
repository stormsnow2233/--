const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const importedItemsFile = path.join(dataDir, 'imported-items.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

fs.mkdirSync(dataDir, { recursive: true });

const db = {
  async batch(items) {
    const existing = readImportedItems();
    const next = [...existing, ...items];
    writeImportedItems(next);
    return next;
  },
};

function writeImportedItems(items) {
  fs.writeFileSync(importedItemsFile, JSON.stringify(items, null, 2), 'utf-8');
}

function readImportedItems() {
  if (!fs.existsSync(importedItemsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(importedItemsFile, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed.map(normalizeItem) : [];
  } catch (error) {
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

function enforceAdminSecret(req, res, next) {
  const authKey = req.body && req.body.authKey;
  if (authKey && authKey !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }
  return next();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/imported-items', (req, res) => {
  const items = readImportedItems();
  res.json({
    items,
    folders: items.filter((item) => item.is_dir),
    tree: buildTree(items, 0),
  });
});

app.post('/api/folders', (req, res) => {
  const { name, parent_id = 0, authKey } = req.body || {};

  if (!authKey || authKey !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const folderName = String(name || '').trim();
  if (!folderName) {
    return res.status(400).json({ success: false, message: '文件夹名称不能为空' });
  }

  const normalizedParentId = normalizeParentId(parent_id);
  const items = readImportedItems();
  const alreadyExists = items.some(
    (item) =>
      String(item.parent_id || 0) === String(normalizedParentId) &&
      item.is_dir &&
      String(item.name || '').trim().toLowerCase() === folderName.toLowerCase()
  );

  if (alreadyExists) {
    return res.status(409).json({ success: false, message: '同一目录下已存在同名文件夹' });
  }

  const folder = normalizeItem({
    id: createId('folder'),
    parent_id: normalizedParentId,
    name: folderName,
    is_dir: true,
    kind: 'folder',
    createdAt: new Date().toISOString(),
  });

  items.push(folder);
  writeImportedItems(items);

  res.status(201).json({ success: true, folder });
});

app.post('/api/items/move', (req, res) => {
  const { item_id, parent_id = 0, authKey } = req.body || {};

  if (authKey && authKey !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const targetParentId = normalizeParentId(parent_id);
  const items = readImportedItems();
  const item = items.find((entry) => String(entry.id) === String(item_id));

  if (!item) {
    return res.status(404).json({ success: false, message: '目标数据不存在' });
  }

  if (String(item.id) === String(targetParentId)) {
    return res.status(400).json({ success: false, message: '不能移动到自身' });
  }

  if (item.is_dir) {
    const descendantIds = collectDescendantIds(items, item.id);
    if (descendantIds.has(String(targetParentId))) {
      return res.status(400).json({ success: false, message: '不能将文件夹移动到其子目录中' });
    }
  }

  item.parent_id = targetParentId;
  writeImportedItems(items);

  res.json({ success: true, item });
});

app.post('/api/admin', (req, res) => {
  const { action, authKey, items = [], parent_id = 0 } = req.body || {};

  if (authKey && authKey !== ADMIN_SECRET) {
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

    db.batch(normalized)
      .then(() => {
        res.json({
          success: true,
          count: normalized.length,
          message: `成功导入 ${normalized.length} 个资源`,
        });
      })
      .catch((error) => {
        res.status(500).json({ success: false, message: '批量导入失败', error: error.message });
      });

    return;
  }

  return res.status(400).json({ success: false, message: '未知指令' });
});

app.delete('/api/items/:id', (req, res) => {
  const { authKey } = req.body || {};
  if (authKey && authKey !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: '管理密钥错误' });
  }

  const { id } = req.params;
  const items = readImportedItems();
  const target = items.find((entry) => String(entry.id) === String(id));

  if (!target) {
    return res.status(404).json({ success: false, message: '数据不存在' });
  }

  const removeIds = new Set([String(target.id)]);
  if (target.is_dir) {
    collectDescendantIds(items, target.id, removeIds);
  }

  const remaining = items.filter((entry) => !removeIds.has(String(entry.id)));

  writeImportedItems(remaining);
  res.json({ success: true, removed: [...removeIds], message: '删除成功' });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`网盘服务启动成功: http://localhost:${PORT}`);
});
