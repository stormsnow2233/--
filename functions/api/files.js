import { ensureImportedTable } from '../_shared/db.js';

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

function buildItemId(prefix = 'upload') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return jsonResponse({ success: false, message: '请选择要上传的文件' }, 400);
    }

    const parentId = normalizeParentId(formData.get('parent_id'));
    const name = String(formData.get('name') || file.name || '未命名文件').trim() || '未命名文件';
    const size = String(file.size || '');

    await ensureImportedTable(env);
    const record = {
      id: buildItemId('upload'),
      parent_id: parentId,
      name,
      is_dir: 0,
      kind: 'file',
      url: '',
      pwd: '',
      size,
      storage_name: `${Date.now()}-${name}`,
      createdAt: new Date().toISOString(),
    };

    await env.DB.prepare(
      `INSERT INTO imported_items (id, parent_id, name, is_dir, url, pwd, size, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        record.id,
        record.parent_id,
        record.name,
        record.is_dir,
        record.url,
        record.pwd,
        record.size,
        record.createdAt
      )
      .run();

    return jsonResponse({
      success: true,
      message: '上传成功',
      file: {
        ...record,
        path: `/api/files/${encodeURIComponent(record.storage_name)}`,
      },
    }, 201);
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '上传失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}

export async function onRequestGet({ env }) {
  try {
    const { results = [] } = await env.DB.prepare('SELECT * FROM imported_items ORDER BY createdAt DESC').all();
    return Response.json({ files: results });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '读取文件失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
