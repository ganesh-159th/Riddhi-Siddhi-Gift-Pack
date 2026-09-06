const BASE = import.meta.env.BASE_URL;

export const asset = (p) => BASE + String(p || "").replace(/^\//, "");

// Inline SVG placeholder shown when a product image is missing or fails to load.
const IMG_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
      `<rect width="400" height="300" fill="#0d1330"/>` +
      `<g fill="none" stroke="#d4af37" stroke-width="2" opacity="0.7">` +
      `<rect x="120" y="90" width="160" height="120" rx="8"/>` +
      `<path d="M120 190 170 145 200 170 230 130 280 190"/>` +
      `</g>` +
      `<text x="200" y="245" fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle">Image unavailable</text>` +
      `</svg>`
  );

// Add a native onError handler so broken images degrade to a themed placeholder
// instead of showing the browser's broken-image icon.
export const imgOnError = (e) => {
  if (e.currentTarget.getAttribute("data-fallback")) return;
  e.currentTarget.setAttribute("data-fallback", "1");
  e.currentTarget.src = IMG_PLACEHOLDER;
};

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
