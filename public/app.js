const EMOJI = { p1: '🧢', p2: '👕', p3: '☕', p4: '👜', p5: '💡', p6: '🎧' };
const NAMES = {};
const PRICES = {};

// Cart pre-loaded like a returning shopper (Studio Tee + 2 Aero Caps).
let cart = [
  { productId: 'p2', qty: 1 },
  { productId: 'p1', qty: 2 },
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---- toasts ---- */
function toast(msg, kind, sub) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ` toast--${kind}` : '');
  t.innerHTML = msg + (sub ? `<small>${sub}</small>` : '');
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
}
function friendlyError(capsuleId) {
  toast('⚠️ Something went wrong on our end.', 'err',
    'Our engineers have been notified.' + (capsuleId ? ` (ref: ${capsuleId})` : ''));
}
window.__capsuleLog = () => toast('A glitch was captured and reported.', 'err', 'Our engineers have been notified.');

/* ---- views ---- */
$$('.nav__link').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.nav__link').forEach((x) => x.classList.remove('is-active'));
    $$('.view').forEach((v) => v.classList.remove('is-active'));
    b.classList.add('is-active');
    $('#view-' + b.dataset.view).classList.add('is-active');
  }),
);

/* ---- catalog ---- */
async function refresh() {
  let tables;
  try {
    tables = await (await fetch('/api/state')).json();
  } catch {
    $('#products').textContent = 'Store backend unreachable.';
    return;
  }
  const products = tables.products || [];
  for (const p of products) { NAMES[p.id] = p.name; PRICES[p.id] = p.price; }

  // shop grid (show all 6 slots; discontinued ones read "Unavailable")
  $('#products').innerHTML = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    .map((id) => {
      const p = products.find((x) => x.id === id);
      if (!p)
        return `<div class="product"><div class="product__img">🚫</div>
          <div class="product__name">${NAMES[id] || 'Item'} </div>
          <div class="product__row"><span class="product__stock sold">Unavailable</span></div></div>`;
      return `<div class="product">
        <div class="product__img">${EMOJI[id] || '📦'}</div>
        <div class="product__name">${p.name}</div>
        <div class="product__row">
          <span class="product__price">$${p.price}</span>
          <span class="product__stock">${p.stock} in stock</span>
        </div>
        <button class="btn btn--sm" data-add="${id}">Add to cart</button>
      </div>`;
    })
    .join('');
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addToCart(b.dataset.add)));

  // admin rows
  $('#admin-rows').innerHTML = products
    .map(
      (p) => `<tr>
        <td>${EMOJI[p.id] || '📦'} ${p.name}</td><td>$${p.price}</td><td>${p.stock}</td>
        <td><button class="btn btn--sm btn--danger" data-disc="${p.id}">Discontinue</button></td>
      </tr>`,
    )
    .join('');
  $$('[data-disc]').forEach((b) => b.addEventListener('click', () => discontinue(b.dataset.disc, b)));

  renderCart();
}

/* ---- cart ---- */
function addToCart(id) {
  const line = cart.find((c) => c.productId === id);
  if (line) line.qty++;
  else cart.push({ productId: id, qty: 1 });
  renderCart();
  toast(`Added ${NAMES[id]} to cart`, 'ok');
}
function renderCart() {
  $('[data-cart-count]').textContent = cart.reduce((n, c) => n + c.qty, 0);
  $('#cart-items').innerHTML = cart.length
    ? cart
        .map(
          (c) => `<div class="citem">
        <span class="citem__emoji">${EMOJI[c.productId] || '📦'}</span>
        <span class="citem__name">${NAMES[c.productId] || c.productId} × ${c.qty}</span>
        <span>$${(PRICES[c.productId] || 0) * c.qty}</span>
        <button class="citem__rm" data-rm="${c.productId}">remove</button>
      </div>`,
        )
        .join('')
    : '<p class="muted">Your cart is empty.</p>';
  const total = cart.reduce((s, c) => s + (PRICES[c.productId] || 0) * c.qty, 0);
  $('#cart-total').textContent = '$' + total;
  $$('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      cart = cart.filter((c) => c.productId !== b.dataset.rm);
      renderCart();
    }),
  );
}
function toggleCart() {
  $('#drawer').classList.toggle('is-open');
  $('#scrim').classList.toggle('is-open');
}
$$('[data-cart-toggle]').forEach((b) => b.addEventListener('click', toggleCart));
$('#scrim').addEventListener('click', toggleCart);

/* ---- actions ---- */
async function checkout() {
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: cart }),
    });
    const data = await res.json();
    if (data.ok) toast(`✅ Order confirmed — total $${data.receipt.total}`, 'ok', 'Thanks for shopping with Lumen!');
    else friendlyError(data.capsuleId);
  } catch (e) {
    friendlyError();
  }
}
$('[data-checkout]').addEventListener('click', checkout);

async function run(scenario) {
  try {
    const res = await fetch('/api/run/' + scenario, { method: 'POST' });
    const data = await res.json();
    if (data.ok) toast('Done.', 'ok');
    else friendlyError(data.capsuleId);
  } catch {
    friendlyError();
  }
}
$$('[data-run]').forEach((b) => b.addEventListener('click', () => run(b.dataset.run)));

async function discontinue(id, btn) {
  await fetch('/api/admin/discontinue/' + id, { method: 'POST' });
  toast(`Discontinued ${NAMES[id] || id}`, 'ok', 'Removed from the live catalog.');
  refresh();
}
$('[data-restock]').addEventListener('click', async () => {
  await fetch('/api/admin/restock', { method: 'POST' });
  toast('Catalog restocked', 'ok');
  refresh();
});

// A genuinely broken UI feature → uncaught frontend error (browser capture).
$('[data-giftfinder]').addEventListener('click', () => {
  const recommender = null;
  recommender.suggest(); // TypeError: Cannot read properties of null (reading 'suggest')
});

setInterval(refresh, 2500);
refresh();
