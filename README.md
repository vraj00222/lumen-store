# Lumen Store

A small demo storefront — **deliberately buggy** — used to showcase
[Capsule](https://github.com/vraj00222/yellow-): *version control for a running
backend* with a crash → triage → **approve-from-Telegram** → heal loop.

This repo is the **application under observation**. Capsule watches it, and (next
iteration) the AI agent opens **fix-PRs against this repo**.

## Run it

```bash
npm install
npm start                       # http://localhost:4100
# point it at your Capsule API (default http://localhost:4000):
CAPSULE_API=http://localhost:4000 npm start
```

Run Capsule's dashboard/API separately (the `yellow-` repo: `npm run api`), then
open the store at http://localhost:4100 and the dashboard at http://localhost:4000.

## How it integrates Capsule (over HTTP — no internals imported)

`src/capsule-client.ts` wraps each route in `guard()`. On a crash it POSTs the
error + the store's current DB tables to Capsule's `POST /api/ingest`; Capsule
freezes the exact state, triages it (category + severity), runs an AI root-cause,
and pings the developer's Telegram. The store **self-heals** by polling
`GET /api/approvals` — when the developer taps **Approve**, it restocks the catalog.

Secrets in the reported request/session are redacted **by Capsule** on ingest.

## The bug (what the agent will fix)

`src/checkout.ts` throws when a cart references a **discontinued** product instead
of degrading gracefully:

```ts
const product = byId.get(item.productId);
if (!product) {
  throw new Error(`Cart references missing product ${item.productId}`);
}
```

**Repro:** Admin → *Discontinue* "Studio Tee", then Cart → *Checkout* → 500.
**Intended fix (agent PR):** skip/guard missing products (and surface a clean
"item no longer available" instead of crashing checkout).

## Other built-in faults (for triage breadth)

Account + Admin actions trigger different error classes — validation, auth/token,
constraint, null, timeout, rate-limit, parse, out-of-range, permission — plus a
genuine **frontend** crash (Gift finder) captured by the browser shim.

## Layout

| Path | What |
| --- | --- |
| `src/server.ts` | store HTTP server (routes + static + self-heal loop) |
| `src/checkout.ts` | the checkout logic — **contains the headline bug** |
| `src/db.ts` | file-backed product catalog (`.lumen/db.json`) |
| `src/capsule-client.ts` | Capsule integration over HTTP (ingest + approvals) |
| `public/` | the storefront UI |

## Roadmap

- **Agent → PR:** on a crash, the Capsule agent proposes a code fix and opens a
  pull request against this repo; the developer approves the PR from Telegram
  (instead of only restoring data).
