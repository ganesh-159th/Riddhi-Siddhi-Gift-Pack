const BASE = import.meta.env.BASE_URL;

export const asset = (p) => BASE + String(p || "").replace(/^\//, "");

// Responsive widths generated for product photos (same rule as the S3 upload
// pipeline in the Lambda handlers: `-<width>w.<ext>` next to the source).
export const IMG_WIDTHS = [400, 800, 1200];

// Base URL for S3-hosted product photos behind the CloudFront CDN.
// Override with VITE_CDN_URL at build time; defaults to the live site origin.
const DEFAULT_SITE_URL = "https://dd4hzdnwrj3px.cloudfront.net";
const CDN = (import.meta.env.VITE_CDN_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");

const isFullUrl = (p) => /^https?:\/\//i.test(String(p || ""));
const isCdnPath = (p) => /^products\//.test(String(p || ""));

// Resolve any product image reference to its final URL:
//  - `products/<id>/<name>.jpg` -> served from the CDN (S3-hosted)
//  - `images/...`               -> legacy repo image, same-origin relative URL
//  - `https://...`              -> already absolute, used as-is
export function imgUrl(p) {
  if (isFullUrl(p)) return p;
  if (isCdnPath(p)) return `${CDN}/${p}`;
  return asset(p);
}

const stripExt = (p) => {
  const s = String(p || "");
  const i = s.lastIndexOf(".");
  return i === -1 ? s : s.slice(0, i);
};

const variantFor = (p, w, ext) => {
  const stem = stripExt(p);
  if (isFullUrl(p)) return `${stem}-${w}w.${ext}`;
  if (isCdnPath(p)) return `${CDN}/${stem}-${w}w.${ext}`;
  const i = stem.lastIndexOf("/");
  if (i === -1) return asset(`responsive/${stem}-${w}w.${ext}`);
  return asset(`${stem.slice(0, i)}/responsive/${stem.slice(i + 1)}-${w}w.${ext}`);
};

export const imgSrcSet = (p) => IMG_WIDTHS.map((w) => `${variantFor(p, w, "jpg")} ${w}w`).join(", ");

export const webpSrcSet = (p) => IMG_WIDTHS.map((w) => `${variantFor(p, w, "webp")} ${w}w`).join(", ");

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

// Blur-up reveal: images start transparent (showing the .img-lazy shimmer
// behind them) and fade in once they actually finish loading. Completed loads
// are tracked so navigating an already-loaded modal image doesn't re-hide it.
export const imgOnLoad = (e) => {
  const img = e.currentTarget;
  if (img.complete && img.naturalWidth > 0) {
    img.classList.add("img-loaded");
  }
};

// Products with a `publishAt` date in the future are "scheduled": they stay in
// products.json (so the date survives across deploys) but are withheld from the
// live site until that moment arrives. Anything invalid or empty does not count.
export function isScheduled(p, now = new Date()) {
  if (!p || !p.publishAt) return false;
  const t = new Date(p.publishAt).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

export function fetchProducts() {
  return fetch(BASE + "products.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("products.json " + res.status);
      return res.json();
    })
    .then((data) => (data.products || []).filter((p) => !isScheduled(p)));
}

export function imgsOf(p) {
  if (!p) return [];
  const arr = (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);
  return arr;
}

// Image metadata recorded at upload time (path, dimensions, size).
export const metaOf = (p, path) => {
  if (!p || !Array.isArray(p.imagesMeta)) return null;
  return p.imagesMeta.find((m) => m.path === path) || null;
};

export const quoteMsgFor = (p) =>
  "Hello, I'm interested in " +
  p.name +
  ". " +
  (p.quoteNote || "Please share your B2B quote and bulk pricing.");