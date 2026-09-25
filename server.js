const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const importedItemsFile = path.join(dataDir, 'imported-items.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-admin-key';

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const db = {
  async batch(items) {
    const existing = readImportedItems();
    const next = [...existing, ...items];
    fs.writeFileSync(importedItemsFile, JSON.stringify(next, null, 2), 'utf-8');
    return next;
  },
};

function readImportedItems() {
  if (!fs.existsSync(importedItemsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(importedItemsFile, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}-${safeName}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname) {
      cb(new Error('File name is required.'));
      return;
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getFiles() {
  return fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
    .map((entry) => {
      const filePath = path.join(uploadDir, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        size: stats.size,
        updatedAt: stats.mtime,
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/files', (req, res) => {
  try {
    const files = getFiles().map((file) => ({
      ...file,
      size: Number(file.size),
      updatedAt: file.updatedAt.toISOString(),
    }));
    res.json({ files });
  } catch (error) {
    res.status(500).json({ message: 'Failed to read files', error: error.message });
  }
});

app.get('/api/imported-items', (req, res) => {
  res.json({ items: readImportedItems() });
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
        id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        parent_id: Number(parent_id) || 0,
        name: String(item.name || '未命名文件').trim() || '未命名文件',
        is_dir: Number(Boolean(item.is_dir)),
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

app.post('/api/files', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Please upload a file.' });
  }

  res.status(201).json({
    message: 'Upload successful',
    file: {
      name: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      path: `/api/files/${encodeURIComponent(req.file.filename)}`,
    },
  });
});

app.get('/api/files/:filename', (req, res) => {
  const { filename } = req.params;
  const safeName = decodeURIComponent(filename);
  const filePath = path.join(uploadDir, safeName);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ message: 'File not found.' });
  }

  res.download(filePath, safeName.replace(/^\d+-/, ''));
});

app.delete('/api/files/:filename', (req, res) => {
  const { filename } = req.params;
  const safeName = decodeURIComponent(filename);
  const filePath = path.join(uploadDir, safeName);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ message: 'File not found.' });
  }

  fs.unlinkSync(filePath);
  res.json({ message: 'File deleted successfully.' });
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
