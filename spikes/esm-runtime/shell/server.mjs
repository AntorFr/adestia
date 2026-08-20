// Minimal static server for the spike — zero dependencies, node:http only.
//
// Layout it serves:
//   /            -> shell/index.html
//   /boot.js     -> shell/boot.js
//   /vendor/*    -> shell/vendor/*          (import-map targets + chunks)
//   /plugins/*   -> ../plugins/*            (SEPARATE folder, mounted at runtime)
//
// The MIME table below is load-bearing: browsers refuse to execute a module
// script whose Content-Type is not a JavaScript MIME type (strict MIME
// checking for `import`), and <link rel=stylesheet> ignores non-text/css.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = resolve(here);
const PLUGINS_ROOT = resolve(here, '..', 'plugins');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.woff2':'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    let root, rel;
    if (pathname.startsWith('/plugins/')) {
      root = PLUGINS_ROOT;
      rel = pathname.slice('/plugins/'.length);
    } else {
      root = SHELL_ROOT;
      rel = pathname.slice(1);
    }

    const filePath = resolve(root, rel);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.code ?? err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`shell listening on http://127.0.0.1:${PORT}/`);
});
