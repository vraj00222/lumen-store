import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const FILE = resolve(process.cwd(), '.lumen', 'db.json');

const HEALTHY: Product[] = [
  { id: 'p1', name: 'Aero Cap', price: 25, stock: 40 },
  { id: 'p2', name: 'Studio Tee', price: 18, stock: 5 },
  { id: 'p3', name: 'Travel Mug', price: 12, stock: 80 },
  { id: 'p4', name: 'Canvas Tote', price: 20, stock: 25 },
  { id: 'p5', name: 'Desk Lamp', price: 35, stock: 14 },
  { id: 'p6', name: 'Noise Buds', price: 60, stock: 9 },
];

const CARTS = [
  { id: 'c1', userId: 'u1', items: [{ productId: 'p2', qty: 1 }, { productId: 'p1', qty: 2 }] },
];
const USERS = [{ id: 'u1', email: 'sam@example.com', plan: 'pro' }];

async function readProducts(): Promise<Product[]> {
  try {
    return JSON.parse(await readFile(FILE, 'utf8')) as Product[];
  } catch {
    return structuredClone(HEALTHY);
  }
}

async function writeProducts(products: Product[]): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(products, null, 2), 'utf8');
}

/** The store's "production database" — a tiny file-backed catalog. */
export const db = {
  products: readProducts,
  async seed(): Promise<void> {
    await writeProducts(structuredClone(HEALTHY));
  },
  async restock(): Promise<void> {
    await writeProducts(structuredClone(HEALTHY));
  },
  async discontinue(id: string): Promise<void> {
    await writeProducts((await readProducts()).filter((p) => p.id !== id));
  },
  /** The full snapshot Capsule freezes when a crash is reported. */
  async tables(): Promise<Record<string, unknown[]>> {
    return { products: await readProducts(), carts: CARTS, users: USERS };
  },
};
