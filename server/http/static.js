import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static file serving.
 *
 * The client is plain HTML, CSS and ES modules, so the server's only job is to
 * hand back the right bytes with the right content type. Anything that is not a
 * known file falls through to `index.html`, which is what lets a deep link such as
 * `/my-bookings/ABC123` survive a page reload.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
export const PUBLIC_DIR = resolve(here, '..', '..', 'public');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const IMMUTABLE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.woff', '.woff2']);

function contentTypeFor(file) {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Resolves a URL path to a file inside `public/`.
 *
 * The resolved path is checked against the public root, so a traversal attempt
 * such as `/../../.env` cannot escape — `normalize` alone would still allow it on
 * some platforms.
 */
function resolveWithinPublic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(PUBLIC_DIR, `.${normalize(decoded)}`);
  if (candidate !== PUBLIC_DIR && !candidate.startsWith(PUBLIC_DIR + sep)) return null;
  return candidate;
}

export function serveStatic(req, res, { indexFile = 'index.html' } = {}) {
  const urlPath = req.url === '/' ? `/${indexFile}` : req.url.split('?')[0];
  let file = resolveWithinPublic(urlPath);

  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    // A path without a file extension is a client route, not a missing asset.
    if (extname(urlPath) !== '') return false;
    file = join(PUBLIC_DIR, indexFile);
    if (!existsSync(file)) return false;
  }

  const stats = statSync(file);
  const extension = extname(file).toLowerCase();

  res.writeHead(200, {
    'content-type': contentTypeFor(file),
    'content-length': stats.size,
    // Hashed image and font filenames never change contents, so they are cached
    // hard; HTML and JS must revalidate or a deploy would not take effect.
    'cache-control': IMMUTABLE.has(extension)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
  });

  createReadStream(file).pipe(res);
  return true;
}

export { contentTypeFor };
