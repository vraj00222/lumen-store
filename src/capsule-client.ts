/**
 * Capsule integration over HTTP — no Capsule internals imported.
 *
 * The store reports a crash (its error + the current DB tables) to Capsule's
 * `POST /api/ingest`. Capsule freezes the exact state, triages it, asks the AI
 * for a root cause, and pings the developer's Telegram. If Capsule is down, the
 * report is swallowed — it must NEVER mask the store's own error.
 */
const CAPSULE_API = process.env.CAPSULE_API ?? 'http://localhost:4000';

type Tables = () => Promise<Record<string, unknown[]>>;

interface GuardCtx {
  url: string;
  body?: unknown;
  tables: Tables;
  /** Repo-relative source file responsible — so Capsule's agent fixes the right file. */
  fixFile?: string;
}

export async function guard<T>(fn: () => T | Promise<T>, ctx: GuardCtx): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await report(err as Error, ctx);
    throw err; // the store's original error, untouched
  }
}

async function report(err: Error, ctx: GuardCtx): Promise<void> {
  try {
    await fetch(`${CAPSULE_API}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: { name: err.name, message: err.message, stack: err.stack },
        request: {
          method: 'POST',
          url: ctx.url,
          headers: { authorization: 'Bearer sek_live_9f2c1d', cookie: 'sid=abc123' },
          body: ctx.body ?? { card: '4111111111111111' },
        },
        session: { userId: 'u1', token: 'sek_live_9f2c1d' },
        tables: await ctx.tables(),
        fixFile: ctx.fixFile,
      }),
    });
  } catch {
    /* Capsule unreachable — ignore */
  }
}

/** Report an error captured out-of-band (e.g. a browser error forwarded here). */
export async function reportError(
  error: { name?: string; message?: string; stack?: string },
  url: string,
  tables: Tables,
): Promise<void> {
  try {
    await fetch(`${CAPSULE_API}/api/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error, request: { method: 'GET', url }, tables: await tables() }),
    });
  } catch {
    /* ignore */
  }
}

/** Poll Capsule for the developer's Telegram approvals (drives self-heal). */
export async function approvals(): Promise<Record<string, { status: string }>> {
  try {
    const r = await fetch(`${CAPSULE_API}/api/approvals`);
    return r.ok ? ((await r.json()) as Record<string, { status: string }>) : {};
  } catch {
    return {};
  }
}
