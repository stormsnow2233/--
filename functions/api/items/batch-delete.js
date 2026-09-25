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

/* Batch delete. Mirrors server.js so the admin's "删除所选" works in production
   too — without this file the endpoint 404s on Cloudflare and the feature only
   ever worked locally.
   Collecting the whole id set first and issuing one D1 batch keeps the operation
   atomic-ish: a folder plus its descendants is removed in a single round trip. */
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { ids, authKey } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonResponse({ success: false, message: '未选择要删除的项' }, 400);
    }

    await ensureImportedTable(env);
    const items = await readImportedItems(env);

    const wanted = new Set(ids.map((id) => String(id)));
    const removeIds = new Set();
    const notFound = [];

    for (const id of wanted) {
      const target = items.find((item) => String(item.id) === id);
      if (!target) {
        notFound.push(id);
        continue;
      }

      removeIds.add(String(target.id));

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
    }

    if (removeIds.size === 0) {
      return jsonResponse({ success: false, message: '所选数据已不存在', notFound }, 404);
    }

    const statements = [...removeIds].map((id) =>
      env.DB.prepare('DELETE FROM imported_items WHERE id = ?').bind(id)
    );
    await env.DB.batch(statements);

    return jsonResponse({
      success: true,
      requested: wanted.size,
      removed: [...removeIds],
      removedCount: removeIds.size,
      notFound,
      message: `已删除 ${removeIds.size} 项`,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '批量删除失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
