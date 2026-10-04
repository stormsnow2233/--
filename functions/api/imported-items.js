import { readImportedItems } from '../_shared/db.js';

export async function onRequestGet({ env }) {
  try {
    const items = await readImportedItems(env);
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to load imported items',
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
}
