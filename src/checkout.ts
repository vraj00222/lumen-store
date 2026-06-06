import type { Product } from './db';

export interface CartItem {
  productId: string;
  qty: number;
}

export interface Receipt {
  total: number;
  lines: Array<{ productId: string; name: string; qty: number; subtotal: number }>;
}

/**
 * Compute a cart total against the current catalog.
 *
 * KNOWN BUG (the one Capsule catches): if a cart line references a product that
 * has been discontinued, this throws instead of degrading gracefully. The AI
 * agent's fix-PR should skip/guard missing products rather than crash checkout.
 */
export function checkout(products: Product[], items: CartItem[]): Receipt {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new Error(`Cart references missing product ${item.productId}`);
    }
    return {
      productId: product.id,
      name: product.name,
      qty: item.qty,
      subtotal: product.price * item.qty,
    };
  });
  return { total: lines.reduce((sum, l) => sum + l.subtotal, 0), lines };
}
