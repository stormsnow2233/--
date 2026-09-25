/* Edge middleware: stamp a build version onto the asset URLs in the HTML.
 *
 * Why: the browser-cache fix on the Express side (server.js) only ran for local
 * development — Cloudflare Pages serves public/index.html as a static asset, so
 * production never got the `?v=` query and phones kept rendering a stale
 * stylesheet. This middleware sits in front of every Pages request and rewrites
 * the two HTML responses, so production behaves the same as local.
 *
 * The version is Pages' own deployment id, which changes on every deploy — more
 * reliable than a file mtime here, since Workers have no filesystem to stat.
 */

const ASSETS = /\/(styles\.css|app\.js|admin\.js|parser\.js)"/g;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const isHtml = url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname === '/admin'
    || url.pathname === '/admin.html';

  const response = await next();

  if (!isHtml || response.status !== 200) {
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  /* The version must be STABLE for a given deploy and only change when the
     deployment does — that is what lets the browser cache the CSS/JS between
     page loads while still picking up new files after a deploy. A per-request
     value (Date.now()) would defeat caching entirely, so it is not used.

     CF_PAGES_COMMIT_SHA identifies the build exactly. It is absent for Direct
     Upload (wrangler) deployments, and CF_PAGES_BRANCH does not change between
     deploys of one branch, so the ETag of the HTML itself is the fallback: Pages
     derives it from the file contents, so it is stable until the HTML changes. */
  const etag = (response.headers.get('etag') || '').replace(/[^A-Za-z0-9]/g, '');
  const version = env?.CF_PAGES_COMMIT_SHA || etag || env?.CF_PAGES_BRANCH || 'dev';

  const html = await response.text();
  const stamped = html.replace(ASSETS, (match, file) => `/${file}?v=${version}"`);

  return new Response(stamped, {
    status: response.status,
    headers: response.headers,
  });
}
