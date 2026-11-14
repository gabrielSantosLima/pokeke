import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Serve the static app from `root`. Returns a listening http.Server. */
export function createStaticServer({ root, port = 0, host = '0.0.0.0' } = {}) {
  const rootDir = resolve(root);

  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    if (pathname === '/') pathname = '/index.html';

    // Only expose the app itself, never server-side code or build artifacts.
    const blocked = ['/node_modules', '/server', '/electron', '/release', '/test'];
    if (blocked.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const filePath = normalize(join(rootDir, pathname));
    if (filePath !== rootDir && !filePath.startsWith(rootDir + sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        response.writeHead(302, { Location: `${request.url.replace(/\/?$/, '/')}index.html` });
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolvePromise(server));
  });
}
