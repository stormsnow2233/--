import { fetchShareMetadata } from '../_shared/metadata.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/* GET /api/metadata?url=<share link>&code=<extraction code>
   Returns { name, size, provider, reason }. Empty fields simply mean "could not
   read it" — the caller keeps whatever it already has. The outbound fetch is
   host-allowlisted inside _shared/metadata.js. `code` matters only for Baidu,
   whose file list sits behind a /share/verify call. */
export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const url = params.get('url') || '';
  const code = params.get('code') || '';

  if (!url) {
    return jsonResponse({ name: '', size: '', provider: null, reason: 'missing-url' }, 400);
  }

  try {
    const result = await fetchShareMetadata(url, code);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({
      name: '',
      size: '',
      provider: null,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
