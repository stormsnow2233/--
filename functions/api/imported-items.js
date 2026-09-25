import { readImportedItems } from '../_shared/db.js';

export async function onRequestGet({ env }) {
  try {
    const items = await readImportedItems(env);
    return Response.json({ items });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: 'Failed to load imported items',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
