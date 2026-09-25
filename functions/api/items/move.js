import { ensureImportedTable, readImportedItems } from '../../_shared/db.js';

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

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { item_id, parent_id = 0, authKey } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const targetParentId = normalizeParentId(parent_id);
    if (!item_id) {
      return jsonResponse({ success: false, message: '缺少移动目标' }, 400);
    }

    await ensureImportedTable(env);
    const items = await readImportedItems(env);
    const item = items.find((entry) => String(entry.id) === String(item_id));

    if (!item) {
      return jsonResponse({ success: false, message: '目标数据不存在' }, 404);
    }

    if (String(item.id) === String(targetParentId)) {
      return jsonResponse({ success: false, message: '不能移动到自身' }, 400);
    }

    if (item.is_dir) {
      const descendantIds = new Set();
      const queue = [String(item.id)];
      while (queue.length) {
        const currentId = queue.shift();
        for (const entry of items) {
          if (String(entry.parent_id || 0) === String(currentId) && !descendantIds.has(String(entry.id))) {
            descendantIds.add(String(entry.id));
            queue.push(String(entry.id));
          }
        }
      }

      if (descendantIds.has(String(targetParentId))) {
        return jsonResponse({ success: false, message: '不能将文件夹移动到其子目录中' }, 400);
      }
    }

    await env.DB.prepare('UPDATE imported_items SET parent_id = ? WHERE id = ?')
      .bind(targetParentId, item.id)
      .run();

    return jsonResponse({
      success: true,
      item: {
        ...item,
        parent_id: targetParentId,
      },
      message: '移动成功',
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '移动失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
