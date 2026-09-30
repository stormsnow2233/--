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
    let thankYouMarkdown = '';
    let announcementMarkdown = '';

    if (env?.DB) {
      const valTitle = await getSetting(env, 'siteTitle');
      if (valTitle) {
        siteTitle = valTitle;
      }
      const valThanks = await getSetting(env, 'thankYouMarkdown');
      if (valThanks !== null && valThanks !== undefined) {
        thankYouMarkdown = valThanks;
      }
      const valAnnounce = await getSetting(env, 'announcementMarkdown');
      if (valAnnounce !== null && valAnnounce !== undefined) {
        announcementMarkdown = valAnnounce;
      }
    }

    return jsonResponse({
      success: true,
      settings: { siteTitle, thankYouMarkdown, announcementMarkdown },
    });
  } catch (error) {
    return jsonResponse({
      success: true,
      settings: { siteTitle: DEFAULT_SITE_TITLE, thankYouMarkdown: '', announcementMarkdown: '' },
    });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { authKey, siteTitle, thankYouMarkdown, announcementMarkdown } = body || {};

    if (!authKey || authKey !== (env?.ADMIN_SECRET || ADMIN_SECRET)) {
      return jsonResponse({ success: false, message: '管理密钥错误或未提供' }, 401);
    }

    const updated = {};

    if (siteTitle !== undefined) {
      const cleanTitle = String(siteTitle || '').trim() || DEFAULT_SITE_TITLE;
      if (env?.DB) {
        await setSetting(env, 'siteTitle', cleanTitle);
      }
      updated.siteTitle = cleanTitle;
    }

    if (thankYouMarkdown !== undefined) {
      const cleanThanks = String(thankYouMarkdown || '').trim();
      if (env?.DB) {
        await setSetting(env, 'thankYouMarkdown', cleanThanks);
      }
      updated.thankYouMarkdown = cleanThanks;
    }

    if (announcementMarkdown !== undefined) {
      const cleanAnnounce = String(announcementMarkdown || '').trim();
      if (env?.DB) {
        await setSetting(env, 'announcementMarkdown', cleanAnnounce);
      }
      updated.announcementMarkdown = cleanAnnounce;
    }

    return jsonResponse({
      success: true,
      message: '设置更新成功',
      settings: updated,
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
