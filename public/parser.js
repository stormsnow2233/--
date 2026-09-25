function parseBatchInput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  if (text.includes('|') || text.includes('\t')) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && (line.includes('|') || line.includes('\t')))
      .map((line) => {
        const delimiter = line.includes('|') ? '|' : '\t';
        const parts = line.split(delimiter).map((part) => part.trim());
        return {
          name: parts[0] || '未命名文件',
          url: parts[1] || '',
          pwd: parts[2] || '',
          size: parts[3] || '',
          is_dir: 0,
        };
      })
      .filter((item) => item.url);
  }

  const results = [];
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const matches = [...text.matchAll(urlRegex)];

  if (!matches.length) {
    return [];
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const url = match[0];
    const startIndex = match.index;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const prevBlock = text.slice(Math.max(0, startIndex - 100), startIndex);
    const postBlock = text.slice(startIndex, endIndex);
    const combinedBlock = prevBlock + '\n' + postBlock;

    const pwdMatch = postBlock.match(/(?:提取码|密码|访问码|code)[:：\s]*([a-zA-Z0-9]+)/i);
    const pwd = pwdMatch ? pwdMatch[1] : '';

    const sizeMatch = postBlock.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB|G|M|K))/i);
    const size = sizeMatch ? sizeMatch[0].toUpperCase() : '';

    let name = '';
    const quoteMatch = combinedBlock.match(/[「“"'](.+?)[」”"']/);
    if (quoteMatch) {
      name = quoteMatch[1].trim();
    } else {
      const lineBeforeUrl = prevBlock.split(/\r?\n/).pop() || '';
      const cleaned = lineBeforeUrl
        .replace(/我.*?分享了|链接[:：]?/g, '')
        .replace(/[\s\u3000]+/g, ' ')
        .trim();
      name = cleaned || '新分享资源';
    }

    results.push({
      name: name || '新分享资源',
      url,
      pwd,
      size,
      is_dir: 0,
    });
  }

  return results;
}

if (typeof window !== 'undefined') {
  window.parseBatchInput = parseBatchInput;
}

if (typeof module !== 'undefined') {
  module.exports = { parseBatchInput };
}
