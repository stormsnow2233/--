function buildItemId(index = 0) {
  return `item-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function ensureImportedTable(env) {
  const db = env?.DB;
  if (!db) {
    throw new Error('Missing Cloudflare D1 binding: DB');
  }

  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS imported_items (
        id TEXT PRIMARY KEY,
        parent_id INTEGER DEFAULT 0,
        name TEXT NOT NULL,
        is_dir INTEGER DEFAULT 0,
        url TEXT,
        pwd TEXT,
        size TEXT,
        description TEXT DEFAULT '',
        createdAt TEXT NOT NULL
      )
    `)
    .run();

  const { results = [] } = await db.prepare('PRAGMA table_info(imported_items)').all();
  if (!results.some((column) => column.name === 'description')) {
    try {
      await db.prepare("ALTER TABLE imported_items ADD COLUMN description TEXT DEFAULT ''").run();
    } catch (error) {
      const { results: migratedColumns = [] } = await db.prepare('PRAGMA table_info(imported_items)').all();
      if (!migratedColumns.some((column) => column.name === 'description')) {
        throw error;
      }
    }
  }
}

export function normalizeImportedItem(item, index = 0) {
  return {
    id: item?.id || buildItemId(index),
    parent_id: Number(item?.parent_id ?? 0) || 0,
    name: String(item?.name || '未命名文件').trim() || '未命名文件',
    is_dir: Number(Boolean(item?.is_dir)) || 0,
    url: String(item?.url || '').trim(),
    pwd: String(item?.pwd || '').trim(),
    size: String(item?.size || '').trim(),
    description: String(item?.description || ''),
    createdAt: item?.createdAt || new Date().toISOString(),
  };
}

export async function readImportedItems(env) {
  await ensureImportedTable(env);

  const { results = [] } = await env.DB.prepare(
    'SELECT * FROM imported_items ORDER BY createdAt DESC'
  ).all();

  return results.map((item) => ({
    id: item.id,
    parent_id: item.parent_id,
    name: item.name,
    is_dir: item.is_dir,
    url: item.url,
    pwd: item.pwd,
    size: item.size,
    description: item.description || '',
    createdAt: item.createdAt,
  }));
}

export async function batchImport(env, items = []) {
  await ensureImportedTable(env);

  const normalized = items
    .filter((item) => item && (item.url || item.name))
    .map((item, index) => normalizeImportedItem(item, index));

  if (!normalized.length) {
    return [];
  }

  const statements = normalized.map((item) =>
    env.DB.prepare(
      `INSERT INTO imported_items (id, parent_id, name, is_dir, url, pwd, size, description, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.id,
      item.parent_id,
      item.name,
      item.is_dir,
      item.url,
      item.pwd,
      item.size,
      item.description,
      item.createdAt
    )
  );

  await env.DB.batch(statements);
  return normalized;
}

export async function ensureSettingsTable(env) {
  const db = env?.DB;
  if (!db) {
    return;
  }
  await db
    .prepare(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)
    .run();
}

export async function getSetting(env, key) {
  if (!env?.DB) {
    return null;
  }
  await ensureSettingsTable(env);
  const row = await env.DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  if (!env?.DB) {
    return;
  }
  await ensureSettingsTable(env);
  await env.DB.prepare(`
    INSERT INTO site_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind(key, value).run();
}
