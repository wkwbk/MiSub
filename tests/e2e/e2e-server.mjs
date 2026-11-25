import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../../worker.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PORT = Number(process.env.E2E_PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const E2E_UPSTREAM_NODES = [
  'vless://11111111-1111-1111-1111-111111111111@hk.e2e.example:443?encryption=none&security=tls&sni=hk.e2e.example#HK-VIP-01',
  'trojan://password123@us.e2e.example:443?sni=us.e2e.example#US-Pro-01',
  `ss://${Buffer.from('aes-256-gcm:password').toString('base64')}@jp.e2e.example:8388#${encodeURIComponent('JP-Trial-官网')}`,
  'vless://22222222-2222-2222-2222-222222222222@sg.e2e.example:443?encryption=none&security=tls&sni=sg.e2e.example#SG-Speed-01',
].join('\n');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input?.url || '';
  if (urlStr.startsWith('https://airport.e2e.example/')) {
    return new Response(Buffer.from(E2E_UPSTREAM_NODES, 'utf8').toString('base64'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Subscription-Userinfo': 'upload=1073741824; download=2147483648; total=107374182400; expire=4102444800',
      },
    });
  }
  return originalFetch(input, init);
};

function createAssetsFetcher() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let relPath = decodeURIComponent(url.pathname);
      if (relPath === '/' || !relPath) relPath = '/index.html';
      const normalized = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
      const fullPath = path.join(DIST_DIR, normalized);
      if (!fullPath.startsWith(DIST_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        return new Response('Not Found', { status: 404 });
      }
      const ext = path.extname(fullPath).toLowerCase();
      const body = fs.readFileSync(fullPath);
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        },
      });
    },
  };
}

let currentDb;
function resetDatabase() {
  clearSettingsCache();
  currentDb = createMemoryD1({
    main: {
      myToken: 'e2e-default-token',
      profileToken: 'sub',
      fileName: 'MiSub-E2E',
      enablePublicPage: true,
      allowBrowserSub: true,
      enableAccessLog: false,
      enableTrafficNode: false,
    },
  });
}

resetDatabase();

const assets = createAssetsFetcher();

function getEnv() {
  return {
    MISUB_DB: currentDb,
    ASSETS: assets,
    ADMIN_PASSWORD: 'e2e-admin-password',
    COOKIE_SECRET: 'e2e-cookie-secret-key',
  };
}

function readNodeBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;
    const fullUrl = new URL(req.url || '/', origin);

    if (req.method === 'POST' && fullUrl.pathname === '/__e2e__/reset') {
      resetDatabase();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else {
        headers.set(key, value);
      }
    }

    const method = (req.method || 'GET').toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readNodeBody(req);
    const webRequest = new Request(fullUrl.toString(), {
      method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const executionCtx = {
      waitUntil(promise) {
        Promise.resolve(promise).catch(() => {});
      },
      passThroughOnException() {},
    };

    const webResponse = await worker.fetch(webRequest, getEnv(), executionCtx);

    const outHeaders = {};
    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      outHeaders[key] = value;
    });
    const setCookies = typeof webResponse.headers.getSetCookie === 'function' ? webResponse.headers.getSetCookie() : [];
    if (setCookies.length > 0) {
      outHeaders['set-cookie'] = setCookies;
    } else if (webResponse.headers.has('set-cookie')) {
      outHeaders['set-cookie'] = webResponse.headers.get('set-cookie');
    }

    res.writeHead(webResponse.status, outHeaders);
    const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.end(responseBuffer);
  } catch (error) {
    console.error('[E2E Server] Request error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(error?.stack || String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[E2E Server] Listening on http://127.0.0.1:${PORT}`);
});
