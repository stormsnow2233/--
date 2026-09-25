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

function getItemIdFromUrl(url) {
  const pathname = new URL(url).pathname;
  const segments = pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

export async function onRequestDelete({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { authKey } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const itemId = getItemIdFromUrl(request.url);
    if (!itemId) {
      return jsonResponse({ success: false, message: '缺少目标 ID' }, 400);
    }

    await ensureImportedTable(env);
    const items = await readImportedItems(env);
    const target = items.find((item) => String(item.id) === String(itemId));

    if (!target) {
      return jsonResponse({ success: false, message: '数据不存在' }, 404);
    }

    const removeIds = new Set([String(target.id)]);

    if (target.is_dir) {
      const queue = [String(target.id)];
      while (queue.length) {
        const currentId = queue.shift();
        for (const item of items) {
          if (String(item.parent_id || 0) === String(currentId) && !removeIds.has(String(item.id))) {
            removeIds.add(String(item.id));
            queue.push(String(item.id));
          }
        }
      }
    }

    for (const id of removeIds) {
      await env.DB.prepare('DELETE FROM imported_items WHERE id = ?').bind(id).run();
    }

    return jsonResponse({ success: true, message: '删除成功', removed: [...removeIds] });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '删除失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { authKey, name } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const nextName = String(name || '').trim();
    if (!nextName) {
      return jsonResponse({ success: false, message: '文件夹名称不能为空' }, 400);
    }

    const itemId = getItemIdFromUrl(request.url);
    if (!itemId) {
      return jsonResponse({ success: false, message: '缺少目标 ID' }, 400);
    }

    await ensureImportedTable(env);
    const items = await readImportedItems(env);
    const target = items.find((item) => String(item.id) === String(itemId));

    if (!target) {
      return jsonResponse({ success: false, message: '数据不存在' }, 404);
    }

    if (!target.is_dir) {
      return jsonResponse({ success: false, message: '只能重命名文件夹' }, 400);
    }

    await env.DB.prepare('UPDATE imported_items SET name = ? WHERE id = ?').bind(nextName, itemId).run();
    return jsonResponse({ success: true, message: '文件夹重命名成功', name: nextName });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '重命名失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
