// Open Food Facts barcode lookup + additive extraction.
// Routes through the gateway proxy (/api/proxy/off) when server.js is up,
// otherwise hits world.openfoodfacts.org directly (OFF supports CORS).

import { type Additive, findAdditive, detectAdditives } from "./additives";
import { isGatewayAvailable } from "./additiveEngine";

const REQUEST_TIMEOUT_MS = 10000;

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  ingredientsText: string;
  additiveTags: string[]; // raw OFF tags, e.g. ["en:e102", "en:e211"]
}

export class ProductNotFoundError extends Error {
  constructor(barcode: string) {
    super(`No product found for barcode ${barcode}.`);
    this.name = "ProductNotFoundError";
  }
}

/** Fetch a product by EAN-13/UPC barcode. Throws ProductNotFoundError when unknown. */
export async function fetchProductByBarcode(barcode: string): Promise<OffProduct> {
  const clean = barcode.replace(/\D/g, "");
  if (!/^\d{6,14}$/.test(clean)) {
    throw new Error(`"${barcode}" does not look like a valid EAN/UPC barcode.`);
  }

  const url = (await isGatewayAvailable())
    ? `/api/proxy/off/${clean}`
    : `https://world.openfoodfacts.org/api/v2/product/${clean}.json`;

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (res.status === 404) throw new ProductNotFoundError(clean);
  if (!res.ok) throw new Error(`Open Food Facts request failed (HTTP ${res.status}).`);

  const data = await res.json();
  if (data?.status !== 1 || !data?.product) throw new ProductNotFoundError(clean);

  const p = data.product;
  return {
    barcode: clean,
    name: p.product_name || p.product_name_en || "Unknown product",
    brand: p.brands || "",
    imageUrl: p.image_front_small_url || p.image_url || null,
    ingredientsText: p.ingredients_text_en || p.ingredients_text || "",
    additiveTags: Array.isArray(p.additives_tags) ? p.additives_tags : [],
  };
}

/**
 * Map an OFF product to known additives in our knowledge base.
 * Primary source: additives_tags ("en:e102" → E102). Fallback: free-text
 * matching over the ingredient list ("sodium benzoate", "tartrazine"...).
 */
export function extractKnownAdditives(product: OffProduct): Additive[] {
  const byId = new Map<string, Additive>();

  for (const tag of product.additiveTags) {
    const eCode = tag.replace(/^[a-z]{2,3}:/i, ""); // "en:e102" → "e102"
    const match = findAdditive(eCode);
    if (match) byId.set(match.id, match);
  }

  if (product.ingredientsText) {
    for (const match of detectAdditives(product.ingredientsText)) {
      byId.set(match.id, match);
    }
  }

  return [...byId.values()];
}
