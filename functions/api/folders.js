import { ensureImportedTable, readImportedItems } from '../_shared/db.js';

const ADMIN_SECRET = 'admin123';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function normalizeParentId(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const stringValue = String(value).trim();
  return /^\d+$/.test(stringValue) ? Number(stringValue) : stringValue;
}

function buildItemId(prefix = 'folder') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, parent_id = 0, authKey } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const folderName = String(name || '').trim();
    if (!folderName) {
      return jsonResponse({ success: false, message: '文件夹名称不能为空' }, 400);
    }

    const normalizedParentId = normalizeParentId(parent_id);
    const items = await readImportedItems(env);
    const duplicate = items.some(
      (item) =>
        String(item.parent_id || 0) === String(normalizedParentId) &&
        item.is_dir &&
        String(item.name || '').trim().toLowerCase() === folderName.toLowerCase()
    );

    if (duplicate) {
      return jsonResponse({ success: false, message: '同一目录下已存在同名文件夹' }, 409);
    }

    const folder = {
      id: buildItemId('folder'),
      parent_id: normalizedParentId,
      name: folderName,
      is_dir: 1,
      kind: 'folder',
      url: '',
      pwd: '',
      size: '',
      storage_name: '',
      createdAt: new Date().toISOString(),
    };

    await ensureImportedTable(env);
    await env.DB.prepare(
      `INSERT INTO imported_items (id, parent_id, name, is_dir, url, pwd, size, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        folder.id,
        folder.parent_id,
        folder.name,
        folder.is_dir,
        folder.url,
        folder.pwd,
        folder.size,
        folder.createdAt
      )
      .run();

    return jsonResponse({ success: true, folder });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '创建文件夹失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
