// Development server for Coral Bay Heat (Node 22, standard library only).
//
//   node serve.ts            →  http://localhost:8080
//   node serve.ts --port N   →  a different port, if 8080 is taken
//
// It serves the game/ folder at the root and the entry's screenshots/
// folder under /screenshots/, with the content types a browser game
// needs. Paths are resolved inside those two roots and anything that
// tries to escape them is refused. This is a local convenience for
// playing and eyeballing captures — not a production web server.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameRoot = resolve(join(here, 'game'));
const shotsRoot = resolve(join(here, 'screenshots'));

const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const requestedPort = portFlag === -1 ? 8080 : Number(argv[portFlag + 1]);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 8080;

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.bin', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function pickRoot(pathname) {
  if (pathname === '/screenshots' || pathname.startsWith('/screenshots/')) {
    return { root: shotsRoot, rel: pathname.slice('/screenshots'.length) || '/' };
  }
  return { root: gameRoot, rel: pathname };
}

function handleRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const { root, rel } = pickRoot(pathname);
  const filePath = resolve(join(root, normalize(rel === '/' ? '/index.html' : rel)));
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }

  let size;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': CONTENT_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}

createServer(handleRequest).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
  console.log(`screenshots/ are on http://localhost:${port}/screenshots/`);
});
