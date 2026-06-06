import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db';
import { checkout, type CartItem } from './checkout';
import { applyPromo } from './pricing';
import { searchProducts } from './search';
import { guard, reportError, approvals } from './capsule-client';

/**
 * Lumen storefront. A normal-looking shop with a known bug (see checkout.ts).
 * Crashes are reported to Capsule over HTTP; on developer approval (from
 * Telegram), the store self-heals by restocking the catalog.
 */
const PORT = Number(process.env.PORT ?? 4100);
const PUBLIC = resolve(fileURLToPath(new URL('..', import.meta.url)), 'public');

const defaultCart: CartItem[] = [
  { productId: 'p2', qty: 1 },
  { productId: 'p1', qty: 2 },
];

/* --------------------------- breadth bugs (real store actions) ------------- */
const SCENARIOS: Record<string, { url: string; run: () => unknown }> = {
  wishlist: { url: '/api/wishlist?user=guest', run: () => (undefined as unknown as { email: string }).email },
  refund: { url: '/api/admin/refund', run: () => { throw new Error('Permission denied: admin refund requires owner role (403)'); } },
  signup: { url: '/api/account/signup', run: () => { throw new Error('Invalid signup: field "email" is required'); } },
  promo: { url: '/api/cart/promo', run: () => { throw new Error('duplicate key value violates unique constraint "promo_redemptions_code_key"'); } },
  sync: { url: '/api/admin/inventory/sync', run: () => { throw new Error('fetch failed: connect ECONNREFUSED inventory-service:9000 (network timeout)'); } },
  like: { url: '/api/products/p1/like', run: () => { throw new Error('Rate limit exceeded: too many requests (429)'); } },
  orders: { url: '/api/account/orders', run: () => { throw new Error('JWT expired — session token is no longer valid, please re-authenticate'); } },
  importcsv: { url: '/api/admin/import', run: () => JSON.parse('{ "rows": [ {"sku": 1}, ]') },
  report: { url: '/api/admin/report?page=999', run: () => { throw new Error('Index 999 out of range: sales report only has 3 pages'); } },
};

/* ------------------------------------------------------------------- the heal */
async function healLoop(): Promise<void> {
  let lastHealed = '';
  for (;;) {
    const all = await approvals();
    for (const [id, a] of Object.entries(all)) {
      if (a.status === 'approved' && id !== lastHealed) {
        await db.restock();
        lastHealed = id;
        console.log(`[lumen] ✅ approval ${id} → restocked catalog; store healed`);
      }
    }
    await sleep(2000);
  }
}

/* --------------------------------------------------------------- http server */
const server = createServer((req, res) => {
  handle(req, res).catch((err) => sendJson(res, 500, { error: (err as Error).message }));
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (path === '/api/state') return sendJson(res, 200, await db.tables());

  if (path === '/api/checkout' && method === 'POST') {
    const body = (await readBody(req)) as { items?: CartItem[] };
    const items = body.items?.length ? body.items : defaultCart;
    try {
      const receipt = await guard(async () => checkout(await db.products(), items), {
        url: '/api/checkout',
        body: { cartId: 'c1', card: '4111111111111111' },
        tables: db.tables,
        fixFile: 'src/checkout.ts',
      });
      return sendJson(res, 200, { ok: true, receipt });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  }

  // Real bug #2: promo code math (src/pricing.ts) — "SAVE20" parses to NaN.
  if (path === '/api/promo' && method === 'POST') {
    const body = (await readBody(req)) as { code?: string; items?: CartItem[] };
    const code = body.code ?? 'SAVE20';
    const items = body.items?.length ? body.items : defaultCart;
    try {
      const products = await db.products();
      const byId = new Map(products.map((p) => [p.id, p]));
      const subtotal = items.reduce((s, it) => s + (byId.get(it.productId)?.price ?? 0) * it.qty, 0);
      const total = await guard(() => applyPromo(subtotal, code), {
        url: '/api/promo',
        body: { code },
        tables: db.tables,
        fixFile: 'src/pricing.ts',
      });
      return sendJson(res, 200, { ok: true, subtotal, total, code });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  }

  // Real bug #3: search compiles user input as a RegExp (src/search.ts).
  if (path === '/api/search' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    try {
      const products = await db.products();
      const results = await guard(() => searchProducts(products, q), {
        url: `/api/search?q=${q}`,
        tables: db.tables,
        fixFile: 'src/search.ts',
      });
      return sendJson(res, 200, { ok: true, results });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  }

  const disc = /^\/api\/admin\/discontinue\/([a-z0-9]+)$/.exec(path);
  if (disc && method === 'POST') {
    await db.discontinue(disc[1]);
    return sendJson(res, 200, { ok: true, id: disc[1] });
  }

  if (path === '/api/admin/restock' && method === 'POST') {
    await db.restock();
    return sendJson(res, 200, { ok: true, message: 'Catalog restocked.' });
  }

  if (path === '/ingest' && method === 'POST') {
    const b = (await readBody(req)) as { name?: string; message?: string; stack?: string; url?: string };
    await reportError(
      { name: b.name ?? 'Error', message: b.message ?? 'Unknown frontend error', stack: b.stack },
      b.url ?? '/ (browser)',
      db.tables,
    );
    return sendJson(res, 200, { ok: true });
  }

  const scenario = /^\/api\/run\/([a-z]+)$/.exec(path);
  if (scenario && method === 'POST') {
    const s = SCENARIOS[scenario[1]];
    if (!s) return sendJson(res, 404, { error: 'unknown action' });
    try {
      const result = await guard(s.run, { url: s.url, tables: db.tables });
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  }

  return serveStatic(path, res);
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not found' });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
function contentType(file: string): string {
  return TYPES[extname(file)] ?? 'application/octet-stream';
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

await db.seed();
void healLoop();
server.listen(PORT, () => {
  console.log(`[lumen] storefront on http://localhost:${PORT}`);
  console.log(`[lumen] reporting crashes to Capsule at ${process.env.CAPSULE_API ?? 'http://localhost:4000'}`);
});
