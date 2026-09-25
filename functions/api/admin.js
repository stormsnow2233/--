import { batchImport } from '../_shared/db.js';

const ADMIN_SECRET = 'admin123';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, authKey, items = [], parent_id = 0 } = body || {};

    if (authKey && authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    if (action !== 'batch_import') {
      return jsonResponse({ success: false, message: '未知指令' }, 400);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ success: false, message: '无有效文件数据' }, 400);
    }

    const normalized = items
      .filter((item) => item && (item.url || item.name))
      .map((item, index) => ({
        id: item?.id || `item-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        parent_id: Number(parent_id) || 0,
        name: String(item.name || '未命名文件').trim() || '未命名文件',
        is_dir: Number(Boolean(item.is_dir)),
        url: String(item.url || '').trim(),
        pwd: String(item.pwd || '').trim(),
        size: String(item.size || '').trim(),
        createdAt: new Date().toISOString(),
      }));

    if (!normalized.length) {
      return jsonResponse({ success: false, message: '无有效文件数据' }, 400);
    }

    await batchImport(env, normalized);

    return jsonResponse({
      success: true,
      count: normalized.length,
      message: `成功导入 ${normalized.length} 个资源`,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '批量导入失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
