/* Share-link metadata lookup, best effort.
 *
 * SAFETY: this makes the server fetch a URL that a user typed, so the target is
 * restricted to a fixed allowlist of public cloud-drive hosts. Without that it
 * would be an SSRF hole (someone could point it at 169.254.169.254 or an
 * internal address). Adding a provider means adding it to DRIVE_HOSTS.
 *
 * It never throws and never rejects: a failed lookup returns empty fields with a
 * reason, so an import can proceed with whatever the user pasted.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DRIVE_HOSTS = [
  { id: 'google', test: /(^|\.)(drive|docs)\.google\.com$/i },
  { id: '123pan', test: /(^|\.)123(?:pan|684|865|912|592)\.(?:com|cn)$/i },
  { id: 'onedrive', test: /(^|\.)(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/i },
  { id: 'dropbox', test: /(^|\.)dropbox\.com$/i },
  // Baidu and Quark expose nothing without the share code, but they are allowed
  // through so the lookup can report "nothing-found" honestly instead of
  // "unsupported-host" — and so a future provider tweak has a place to live.
  { id: 'baidu', test: /(^|\.)(pan|yun|eyun)\.baidu\.com$/i },
  { id: 'quark', test: /(^|\.)pan\.quark\.cn$/i },
];

/* Titles that mean "this page will not tell you the filename" — a login wall, a
   password prompt, or a bare product name. Never use these as a resource name. */
const USELESS_TITLES = [
  /^(网页未找到|ページが見つかりません|Error\s*404)/i,
  /请输入提取码|提取码|访问码/,
  /^Microsoft OneDrive$/i,
  /^(百度网盘|123云盘|Google\s*(云端硬盘|ドライブ|Drive)|Dropbox)\s*$/i,
  /^(登录|Sign\s*in|Log\s*in)/i,
];

export function detectHost(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    return DRIVE_HOSTS.find((d) => d.test.test(host)) || null;
  } catch (error) {
    return null;
  }
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const rounded = value >= 100 || i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

/* Google Drive file/folder id from the several shapes a share link takes:
   /file/d/<id>/view, /drive/folders/<id>, /document/d/<id>/..., /open?id=<id>.
   Folder ids are extracted too — lookupGoogle then detects the folder from the
   download response and reports it, rather than bailing out earlier. */
export function googleFileId(url) {
  try {
    const u = new URL(url);
    const byPath = u.pathname.match(/\/(?:d|folders)\/([A-Za-z0-9_-]{10,})/);
    if (byPath) {
      return byPath[1];
    }
    const byQuery = u.searchParams.get('id');
    if (byQuery && /^[A-Za-z0-9_-]{10,}$/.test(byQuery)) {
      return byQuery;
    }
  } catch (error) {
    /* not a url */
  }
  return '';
}

function ogTitle(html) {
  return (
    (html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i) || [])[1] ||
    (html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i) || [])[1] ||
    ''
  ).trim();
}

function htmlTitle(html) {
  return ((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '').trim();
}

/* Folder names come from <title> on 123pan etc., e.g.
   "name.zip - 123云盘免费不限速|下载免登录". Strip the product suffix, then
   reject anything that is really a login / password wall. */
const TITLE_SUFFIX = /\s*[-–—|]\s*(123\s*云盘|百度网盘|Google\s*(云端硬盘|ドライブ|Drive)|Microsoft OneDrive|OneDrive|Dropbox).*$/i;

function nameFromTitle(html, driveId) {
  const title = htmlTitle(html);
  if (!title) {
    return '';
  }
  if (USELESS_TITLES.some((re) => re.test(title))) {
    return '';
  }
  let name = title.replace(TITLE_SUFFIX, '').trim();
  if (driveId === '123pan') {
    // 123pan appends " - " before its marketing line
    name = name.split(/\s+-\s+/)[0].trim();
  }
  if (!name || USELESS_TITLES.some((re) => re.test(name))) {
    return '';
  }
  return name;
}

/* ---------------- Baidu -------------------------------------------------
   Two steps are required, both discovered by probing:

   1. POST /share/verify with the share code. errno 0 means the code is right
      (errno -9 means wrong) and returns `randsk`, which doubles as the BDCLND
      cookie that unlocks the share.
   2. GET /share/list. The `root=1` parameter is NOT optional — without it the
      API answers errno 2 "啊哦，链接出错了" even for a verified share. With it,
      the file list comes back with server_filename and an exact byte size.

   Only works when the share carries an extraction code; without one there is
   nothing to verify and the name stays empty.
--------------------------------------------------------------------- */

function baiduShareKey(url) {
  try {
    const path = new URL(url).pathname;
    // /s/1<key> — the key after "1", sometimes followed by more segments.
    const m = path.match(/\/s\/1([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  } catch (error) {
    return '';
  }
}

async function lookupBaidu(url, code) {
  const surl = baiduShareKey(url);
  if (!surl) {
    return { name: '', size: '', reason: 'no-share-key' };
  }
  if (!code) {
    return { name: '', size: '', reason: 'needs-code' };
  }

  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i > 0) {
        jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    }
  };

  const shareUrl = `https://pan.baidu.com/s/1${surl}`;
  const headers = (extra) => ({
    'user-agent': UA,
    'accept-language': 'zh-CN,zh;q=0.9',
    referer: shareUrl,
    cookie: cookieHeader(),
    ...extra,
  });

  try {
    const page = await fetch(shareUrl, { headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' } });
    absorb(page);
    const html = await page.text();

    const shareid = (html.match(/"shareid"\s*:\s*"?(\d+)/i) || [])[1] || '';
    const shareUk = (html.match(/"share_uk"\s*:\s*"?(\d+)/i) || [])[1] || '';
    if (!shareid || !shareUk) {
      return { name: '', size: '', reason: 'no-share-ids' };
    }

    const verify = await fetch(
      `https://pan.baidu.com/share/verify?surl=${surl}&t=${Date.now()}&channel=chunlei&web=1&app_id=250528&clienttype=0`,
      {
        method: 'POST',
        headers: headers({ 'content-type': 'application/x-www-form-urlencoded' }),
        body: `pwd=${encodeURIComponent(code)}&vcode=&vcode_str=`,
      }
    );
    absorb(verify);
    const verifyBody = (await verify.text()).trim();
    if (/"errno"\s*:\s*-?\d+/.test(verifyBody) && !/"errno"\s*:\s*0\b/.test(verifyBody)) {
      return { name: '', size: '', reason: 'bad-code' };
    }

    const list = await fetch(
      `https://pan.baidu.com/share/list?uk=${shareUk}&shareid=${shareid}`
        + `&root=1&dir=%2F&page=1&num=100&order=other&desc=1&showempty=0`
        + `&channel=chunlei&web=1&app_id=250528&clienttype=0&t=${Date.now()}`,
      { headers: headers() }
    );
    const listBody = await list.text();

    let parsed;
    try {
      parsed = JSON.parse(listBody);
    } catch (error) {
      return { name: '', size: '', reason: 'unparseable-list' };
    }

    if (parsed.errno !== 0 || !Array.isArray(parsed.list) || !parsed.list.length) {
      return { name: '', size: '', reason: 'empty-list' };
    }

    // Baidu marks directories explicitly. A share holding a folder (or several
    // entries) is not a single-file share, so it is reported as such instead of
    // silently importing whichever entry happens to be first.
    if (parsed.list.length > 1) {
      return { name: '', size: '', reason: 'multi-entry', entries: parsed.list.length };
    }

    const first = parsed.list[0];
    if (Number(first.isdir) === 1) {
      return { name: '', size: '', reason: 'folder' };
    }

    const name = String(first.server_filename || '').trim();
    return {
      name,
      size: formatBytes(first.size),
      reason: name ? 'ok' : 'nothing-found',
      entries: 1,
    };
  } catch (error) {
    return { name: '', size: '', reason: 'network' };
  }
}

async function lookupGoogle(url) {
  const id = googleFileId(url);
  if (!id) {
    return { name: '', size: '', reason: 'no-file-id' };
  }

  let name = '';

  // The share page carries the real filename in og:title.
  try {
    const res = await fetch(`https://drive.google.com/file/d/${id}/view`, {
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
    });
    if (res.ok) {
      name = ogTitle(await res.text());
    }
  } catch (error) {
    /* fall through to the download header pass */
  }

  // The download response exposes the exact filename and the byte size. HEAD
  // plus confirm=t is what returns real headers; without confirm=t Drive hands
  // back a virus-scan interstitial instead.
  let size = '';
  let downloadExplicitlyNotAFile = false;

  for (let attempt = 0; attempt < 2 && !name; attempt += 1) {
    try {
      const res = await fetch(
        `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
        { method: 'HEAD', headers: { 'user-agent': UA } }
      );
      const disposition = res.headers.get('content-disposition') || '';
      const looksLikeAttachment = /attachment/i.test(disposition);

      /* Positive evidence that this is not a file: the endpoint answered, but
         with a viewer/interstitial page rather than an attachment. Drive does
         that for a folder — and only for a folder — so it is safe to report.
         A failed request is deliberately NOT treated as a folder: Drive
         rate-limits repeated lookups, and guessing there would reject perfectly
         good links. */
      if (!looksLikeAttachment) {
        downloadExplicitlyNotAFile = true;
        break;
      }

      const fn = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      if (fn) {
        try {
          name = decodeURIComponent(fn[1].replace(/"/g, '').trim()) || name;
        } catch (error) {
          /* keep the og:title value */
        }
      }
      size = formatBytes(res.headers.get('content-length'));
    } catch (error) {
      /* inconclusive — retry once when we still have no name from og:title */
    }
  }

  if (downloadExplicitlyNotAFile && !name) {
    return { name: '', size: '', reason: 'folder' };
  }

  if (name || size) {
    return { name, size, reason: 'ok' };
  }

  /* Nothing readable. Say so instead of guessing — an unverifiable link is kept
     and flagged rather than rejected, so a transient Drive hiccup cannot throw
     away a real resource. */
  return { name: '', size: '', reason: 'unverified' };
}

/* Best-effort metadata for a share URL. Never throws.
   `code` is the extraction code when the paste supplied one — only Baidu needs
   it (its file list is behind /share/verify). */
export async function fetchShareMetadata(url, code = '') {
  const target = detectHost(url);
  if (!target) {
    return { name: '', size: '', provider: null, reason: 'unsupported-host' };
  }

  if (target.id === 'google') {
    const result = await lookupGoogle(url);
    return { ...result, provider: 'google' };
  }

  if (target.id === 'baidu') {
    const result = await lookupBaidu(url, code);
    return { ...result, provider: 'baidu' };
  }

  /* Everything else: fetch the share page and try og:title first.
     The <title> fallback is only enabled for providers verified to put the real
     filename there (123pan). Quark's <title> is just "夸克网盘分享", so using it
     would write a plausible-looking but wrong name into the field — worse than
     leaving it empty. OneDrive redirects to a login-only view and is reported as
     nothing found. */
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
    });
    if (!res.ok) {
      return { name: '', size: '', provider: target.id, reason: `http-${res.status}` };
    }
    const html = await res.text();
    const fromTitle = target.id === '123pan' ? nameFromTitle(html, target.id) : '';
    const name = ogTitle(html) || fromTitle;
    return { name, size: '', provider: target.id, reason: name ? 'ok' : 'nothing-found' };
  } catch (error) {
    return { name: '', size: '', provider: target.id, reason: 'network' };
  }
}
