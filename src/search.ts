import type { Product } from './db';

/**
 * Search the catalog by product name.
 *
 * KNOWN BUG (the one Capsule catches): the raw user query is compiled straight into
 * a RegExp, so a query containing regex metacharacters (e.g. "(" or "[") throws
 * "Invalid regular expression" and the search endpoint 500s.
 *
 * Intended agent fix: escape the query before building the RegExp, or match it as a
 * plain case-insensitive substring.
 */
export function searchProducts(products: Product[], query: string): Product[] {
  const re = new RegExp(query, 'i');
  return products.filter((p) => re.test(p.name));
}
