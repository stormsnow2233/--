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
  let updatingDescription = false;
  try {
    const body = await request.json().catch(() => ({}));
    const { authKey, name, description } = body || {};
    updatingDescription = Object.prototype.hasOwnProperty.call(body, 'description');

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
    const nextName = String(name || '').trim();
    const nextDescription = String(description || '');
    if (!hasName && !hasDescription) {
      return jsonResponse({ success: false, message: '缺少要更新的内容' }, 400);
    }
    if (hasName && !nextName) {
      return jsonResponse({ success: false, message: '名称不能为空' }, 400);
    }
    if (hasDescription && nextDescription.length > 2000) {
      return jsonResponse({ success: false, message: '文件夹简介不能超过 2000 个字符' }, 400);
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

    if (hasDescription && !target.is_dir) {
      return jsonResponse({ success: false, message: '只有文件夹可以设置简介' }, 400);
    }

    if (hasName && hasDescription) {
      await env.DB.prepare('UPDATE imported_items SET name = ?, description = ? WHERE id = ?')
        .bind(nextName, nextDescription, itemId).run();
    } else if (hasName) {
      await env.DB.prepare('UPDATE imported_items SET name = ? WHERE id = ?').bind(nextName, itemId).run();
    } else {
      await env.DB.prepare('UPDATE imported_items SET description = ? WHERE id = ?')
        .bind(nextDescription, itemId).run();
    }

    return jsonResponse({
      success: true,
      message: hasName ? `${target.is_dir ? '文件夹' : '文件'}重命名成功` : '文件夹简介已保存',
      ...(hasName ? { name: nextName } : {}),
      ...(hasDescription ? { description: nextDescription } : {}),
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: updatingDescription ? '文件夹简介保存失败' : '重命名失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
