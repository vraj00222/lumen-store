/**
 * Apply a promo code to an order subtotal.
 *
 * KNOWN BUG (the one Capsule catches): a percent code like "SAVE20" is parsed with
 * `parseInt(code)`, which is NaN because the code starts with letters. The discount
 * — and the resulting order total — become NaN, and checkout blows up.
 *
 * Intended agent fix: extract the numeric percent from the code (e.g. the trailing
 * digits) and reject unknown codes, instead of feeding NaN into the total.
 */
export function applyPromo(subtotal: number, code: string): number {
  const percent = parseInt(code, 10); // NaN for "SAVE20"
  const discount = subtotal * (percent / 100);
  const total = subtotal - discount; // NaN
  if (!(total >= 0)) {
    throw new Error(`Promo "${code}" produced an invalid order total: ${total} (NaN)`);
  }
  return Math.round(total * 100) / 100;
}
