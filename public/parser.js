/* Share-link parser with multi-cloud support.
   Recognises Baidu, Quark, Aliyun, Xunlei, Tianyi, 123pan, 115, Google Drive,
   OneDrive, Dropbox and Mega share URLs. Direct links and folder links work too;
   an unknown host is kept as a generic entry rather than dropped.

   Two input styles, unchanged from before:
     我分享了「名字.zip」链接：https://pan.baidu.com/s/1abc 提取码: 1234
     名字.7z | https://www.123pan.com/s/def | 8888 | 15MB
*/

/* Each drive: a label, host test, and whether a share code is normally needed.
   `needsCode` drives only the UI hint and whether a bare 4-character code is
   harvested as a password for that host. */
const DRIVE_DEFS = [
  { id: 'baidu', label: '百度网盘', needsCode: true, host: /(^|\.)(pan|yun|eyun)\.baidu\.com$/i, url: /https?:\/\/[^\s"'<>]*baidu\.com[^\s"'<>]*/i },
  { id: 'quark', label: '夸克网盘', needsCode: true, host: /(^|\.)pan\.quark\.cn$/i, url: /https?:\/\/[^\s"'<>]*(?:pan\.quark\.cn|quark\.cn\/s\/)[^\s"'<>]*/i },
  { id: 'aliyun', label: '阿里云盘', needsCode: true, host: /(^|\.)(aliyundrive|alipan)\.com$/i, url: /https?:\/\/[^\s"'<>]*(?:aliyundrive\.com|alipan\.com)[^\s"'<>]*/i },
  { id: 'xunlei', label: '迅雷云盘', needsCode: true, host: /(^|\.)pan\.xunlei\.com$/i, url: /https?:\/\/[^\s"'<>]*pan\.xunlei\.com[^\s"'<>]*/i },
  { id: 'tianyi', label: '天翼云盘', needsCode: true, host: /(^|\.)(cloud\.189\.cn|189\.cn)$/i, url: /https?:\/\/[^\s"'<>]*(?:cloud\.189\.cn|189\.cn)[^\s"'<>]*/i },
  { id: '123pan', label: '123 云盘', needsCode: true, host: /(^|\.)123(?:pan|684|865|912|592)\.(?:com|cn)$/i, url: /https?:\/\/[^\s"'<>]*123(?:pan|684|865|912|592)\.(?:com|cn)[^\s"'<>]*/i },
  { id: '115', label: '115 网盘', needsCode: true, host: /(^|\.)(115\.com|115cdn\.com|anxia\.com)$/i, url: /https?:\/\/[^\s"'<>]*(?:115\.com|115cdn\.com|anxia\.com)[^\s"'<>]*/i },
  { id: 'google', label: 'Google Drive', needsCode: false, host: /(^|\.)(drive|docs)\.google\.com$/i, url: /https?:\/\/[^\s"'<>]*(?:drive|docs)\.google\.com[^\s"'<>]*/i },
  { id: 'onedrive', label: 'OneDrive', needsCode: false, host: /(^|\.)(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/i, url: /https?:\/\/[^\s"'<>]*(?:1drv\.ms|onedrive\.live\.com|sharepoint\.com)[^\s"'<>]*/i },
  { id: 'dropbox', label: 'Dropbox', needsCode: false, host: /(^|\.)dropbox\.com$/i, url: /https?:\/\/[^\s"'<>]*dropbox\.com[^\s"'<>]*/i },
  { id: 'mega', label: 'MEGA', needsCode: false, host: /(^|\.)mega\.nz$/i, url: /https?:\/\/[^\s"'<>]*mega\.nz[^\s"'<>]*/i },
];

const GENERIC_DRIVE = { id: 'other', label: '其他链接', needsCode: true };

function hostOf(url) {
  const match = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
  if (!match) {
    return '';
  }
  return match[1].replace(/:\d+$/, '').toLowerCase();
}

/* Which drive a URL belongs to. Falls back to a generic entry. */
function detectDrive(url) {
  const host = hostOf(url);
  if (!host) {
    return GENERIC_DRIVE;
  }

  for (const drive of DRIVE_DEFS) {
    if (drive.host.test(host)) {
      return drive;
    }
  }

  return GENERIC_DRIVE;
}

/* Strip trailing punctuation that prose tends to leave on a URL, and drop
   tracking noise some clients append when copying a share link. */
function cleanUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  url = url.replace(/[),，。、；;！!？?】】"'<>]+$/g, '');

  const drive = detectDrive(url);
  if (drive.id === 'google') {
    // Google Drive appends ?usp=sharing / &usp=drive_link; harmless but noisy.
    url = url.replace(/([?&])usp=[^&]*&?/gi, '$1').replace(/[?&]$/, '');
  }

  return url;
}

/* Pull a share code out of the text that follows (or precedes) a link.
   Only meaningful for drives that actually use codes. */
function extractCode(text, drive) {
  if (!drive.needsCode) {
    return '';
  }

  const labelled = String(text || '').match(
    /(?:提取码|访问码|密码|分享码|提取密码|code|pwd|passcode)\s*[:：=]?\s*([a-zA-Z0-9]{1,16})/i
  );
  if (labelled) {
    return labelled[1];
  }

  // Baidu also writes it as "?pwd=abcd" inside the link itself.
  const inUrl = String(text || '').match(/[?&]pwd=([a-zA-Z0-9]{1,16})/i);
  if (inUrl) {
    return inUrl[1];
  }

  // Last resort: a bare 4-character code sitting on its own, e.g. "8888".
  const bare = String(text || '').match(/(?:^|[\s（(【\]])([a-zA-Z0-9]{4})(?=$|[\s）)】\]])/);
  return bare ? bare[1] : '';
}

/* Last-resort name when the paste carried no usable title (a bare cloud link
   usually has none). Only accepts a path segment that actually looks like a
   filename; opaque share ids are rejected so the row reads "Google Drive 资源"
   instead of a meaningless token like "c2047de04f740c2e". */
const GENERIC_PATH_SEGMENTS = new Set([
  'view', 'edit', 'preview', 'share', 'sharing', 'file', 'files', 'folder', 'folders',
  'drive', 's', 'u', 't', 'd', 'f', 'b', 'c', 'i', 'index.html', 'home', 'open', 'download',
]);

function looksLikeFileName(segment) {
  const name = String(segment || '').trim();
  if (name.length < 5 || name.length > 120) {
    return false;
  }
  if (GENERIC_PATH_SEGMENTS.has(name.toLowerCase())) {
    return false;
  }
  // A real file name carries an extension and at least one non-hex character.
  // This is what separates "K50-ROM-v14.zip" from a share id such as
  // "c2047de04f740c2e" or "18xYpkkShVBwsN0O4AJ1wYOx0TlVPdUAD".
  const hasExtension = /\.[A-Za-z0-9]{2,5}$/.test(name);
  const looksOpaque = /^[0-9a-f]{16,}$/i.test(name);
  return hasExtension && !looksOpaque;
}

function deriveNameFromUrl(url, drive) {
  const generic = (drive && drive.label ? `${drive.label} 资源` : '分享资源');

  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch (error) {
    return generic;
  }

  const segments = pathname
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part).trim();
      } catch (error) {
        return part.trim();
      }
    })
    .filter(Boolean);

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (looksLikeFileName(segments[i])) {
      const name = segments[i];
      return name.length > 80 ? name.slice(0, 80) : name;
    }
  }

  return generic;
}

function extractName(prevBlock, postBlock) {
  const quoted = (prevBlock + '\n' + postBlock).match(/[「“"'](.+?)[」”"']/);
  if (quoted) {
    return quoted[1].trim();
  }

  const lineBefore = String(prevBlock || '').split(/\r?\n/).pop() || '';
  const cleaned = lineBefore
    .replace(/我.*?分享了|分享了|链接\s*[:：]?|地址\s*[:：]?/g, '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();

  // Never let a bare URL (or a leftover code label) become the resource name.
  if (!cleaned || /^https?:\/\//i.test(cleaned) || /^(?:提取码|访问码|密码|分享码|code|pwd)\b/i.test(cleaned)) {
    return '';
  }

  return cleaned;
}

/* Pull a size out of the prose around a link.
   Two guards against false positives, both learned the hard way:
   - the unit must be 2+ chars or a lone G/M, so a lowercase "t" in a file id
     (…v140T1PVDuAD…) is not read as "0T"
   - the number must not be glued to a preceding alphanumeric, so digits inside
     a URL (…1PVDuAD…) cannot start a match
   Result: "15MB", "1.2 GB" match; "0T" inside an id does not. */
function extractSize(text) {
  const match = String(text || '').match(
    /(?<![a-zA-Z0-9])(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB|G|M|T)(?![a-zA-Z])/i
  );
  if (!match) {
    return '';
  }
  return `${match[1]}${match[2].toUpperCase()}`;
}

/* Parse one pipe/tab delimited row: name | url | pwd | size */
function parseDelimitedLine(line) {
  const delimiter = line.includes('|') ? '|' : '\t';
  const parts = line.split(delimiter).map((part) => part.trim());
  const url = cleanUrl(parts[1] || '');
  const drive = detectDrive(url);
  return {
    name: parts[0] || deriveNameFromUrl(url, drive) || '未命名文件',
    url,
    pwd: parts[2] || '',
    size: parts[3] || '',
    drive: drive.id,
    driveLabel: drive.label,
    is_dir: 0,
  };
}

/* Scan a run of plain prose for share links. `nextIndex` is where the next
   delimited row starts, used to bound the last link's trailing context. */
function parseProseBlock(block, absoluteOffset) {
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const matches = [...block.matchAll(urlRegex)];
  const results = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const url = cleanUrl(match[0]);
    const drive = detectDrive(url);
    const startIndex = match.index;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : block.length;
    const prevBlock = block.slice(Math.max(0, startIndex - 100), startIndex);
    const postBlock = block.slice(startIndex, endIndex);

    const name = extractName(prevBlock, postBlock) || deriveNameFromUrl(url, drive);

    results.push({
      name: name || '新分享资源',
      url,
      pwd: extractCode(postBlock, drive),
      size: extractSize(postBlock),
      drive: drive.id,
      driveLabel: drive.label,
      is_dir: 0,
    });
  }

  return results;
}

function parseBatchInput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return [];
  }

  /* Decide per line, not globally. A batch that mixes delimited rows with prose
     (or a bare URL) must keep both: an earlier all-or-nothing pipe check threw
     away every non-pipe line. */
  const lines = text.split(/\r?\n/);
  const isDelimited = (line) => line.includes('|') || line.includes('\t');
  const hasDelimitedRow = lines.some((line) => line.trim() && isDelimited(line));

  if (!hasDelimitedRow) {
    return parseProseBlock(text);
  }

  const results = [];
  let proseBuffer = [];

  const flushProse = () => {
    if (!proseBuffer.length) {
      return;
    }
    results.push(...parseProseBlock(proseBuffer.join('\n')));
    proseBuffer = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      proseBuffer.push(line);
      continue;
    }

    if (isDelimited(line)) {
      flushProse();
      const item = parseDelimitedLine(line);
      if (item.url) {
        results.push(item);
      }
      continue;
    }

    proseBuffer.push(line);
  }

  flushProse();
  return results;
}

/* Human-readable summary of which drives a parsed batch covers, e.g.
   "百度网盘 ×2、Google Drive ×1". Used for the admin feedback message. */
function summarizeDrives(items) {
  const counts = new Map();
  for (const item of items || []) {
    const label = item.driveLabel || detectDrive(item.url).label;
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label))
    .join('、');
}

if (typeof window !== 'undefined') {
  window.parseBatchInput = parseBatchInput;
  window.detectDrive = detectDrive;
  window.summarizeDrives = summarizeDrives;
  window.DRIVE_DEFS = DRIVE_DEFS;
}

if (typeof module !== 'undefined') {
  module.exports = { parseBatchInput, detectDrive, summarizeDrives, DRIVE_DEFS };
}
