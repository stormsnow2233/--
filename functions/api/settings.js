import { getSetting, setSetting } from '../_shared/db.js';

const ADMIN_SECRET = 'admin123';
const DEFAULT_SITE_TITLE = 'K50电竞版ROM小站';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    let siteTitle = DEFAULT_SITE_TITLE;
    if (env?.DB) {
      const val = await getSetting(env, 'siteTitle');
      if (val) {
        siteTitle = val;
      }
    }
    return jsonResponse({ success: true, settings: { siteTitle } });
  } catch (error) {
    return jsonResponse({ success: true, settings: { siteTitle: DEFAULT_SITE_TITLE } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { authKey, siteTitle } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误' }, 401);
    }

    const cleanTitle = String(siteTitle || '').trim() || DEFAULT_SITE_TITLE;

    if (env?.DB) {
      await setSetting(env, 'siteTitle', cleanTitle);
    }

    return jsonResponse({
      success: true,
      message: '站名更新成功',
      settings: { siteTitle: cleanTitle },
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: '更新失败',
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
