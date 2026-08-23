const BASE = import.meta.env.BASE_URL;

export const asset = (p) => BASE + String(p || "").replace(/^\//, "");

export async function fetchProducts() {
  const res = await fetch(BASE + "products.json", { cache: "no-store" });
  if (!res.ok) throw new Error("products.json " + res.status);
  const data = await res.json();
  return data.products || [];
}

export function imgsOf(p) {
  if (!p) return [];
  const arr = (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);
  return arr;
}

export const quoteMsgFor = (p) =>
  "Hello, I'm interested in " +
  p.name +
  ". " +
  (p.quoteNote || "Please share your B2B quote and bulk pricing.");
