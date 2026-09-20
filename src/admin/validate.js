import { imgUrl, isScheduled } from "../lib/products.js";

// Pure validation + status helpers for the admin panel (issue #21). Kept free
// of DOM/state so the exact same rules are unit-tested in tests/admin.test.js.

// Mirrors the image-reference rules shared by the pipeline
// (netlify/lib/images.mjs) and the renderer (src/lib/products.js).
const S3_KEY_RE = /^products\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/i;
const LEGACY_KEY_RE = /^images\/[a-z0-9._-]+\.(jpe?g|png|webp)$/i;
const FULL_URL_RE = /^https?:\/\//i;

const isPublishableImage = (path) =>
  S3_KEY_RE.test(path) || LEGACY_KEY_RE.test(path) || FULL_URL_RE.test(path);

const imgsOf = (p) =>
  (p && p.images && p.images.length ? p.images : [p && p.image]).filter(Boolean);

const BADGE_STYLES = ["gold", "wine", "ink"];

/**
 * Structural checks that never touch the network:
 *  - required fields (name, id, photos, alt)
 *  - no duplicate ids
 *  - image references are well-formed (S3 key / legacy repo path / URL)
 *  - badges use a known style
 *  - publishAt, if set, is a real date
 * Returns { errors, warnings } where each entry is { id, message }.
 */
export function validateProductList(products) {
  const errors = [];
  const warnings = [];
  const seenIds = new Map(); // lowercased id -> product name
  const seenImages = new Map(); // image path -> product name

  (Array.isArray(products) ? products : []).forEach((p, i) => {
    const display = String(p?.name || `Product #${i + 1}`).trim();
    const pid = String(p?.id || "");

    if (!String(p?.name || "").trim()) {
      errors.push({ id: pid, message: `${display}: a product name is required.` });
    }
    if (!pid.trim()) {
      errors.push({ id: pid, message: `${display}: the product id is missing.` });
    } else {
      const key = pid.trim().toLowerCase();
      if (seenIds.has(key)) {
        errors.push({
          id: pid,
          message: `Duplicate product id "${pid}" — ${seenIds.get(key)} and ${display} share it.`,
        });
      } else {
        seenIds.set(key, display);
      }
    }

    const images = imgsOf(p);
    if (!images.length) {
      errors.push({ id: pid, message: `${display}: add at least one photo.` });
    }
    images.forEach((img) => {
      if (FULL_URL_RE.test(img)) return;
      // data URIs never survive a publish — photos must go through the S3 upload.
      if (/^data:image\//i.test(img)) {
        errors.push({ id: pid, message: `${display}: "${img.slice(0, 40)}" is an un-uploaded photo.` });
        return;
      }
      if (!isPublishableImage(img)) {
        errors.push({ id: pid, message: `${display}: invalid image path "${img}".` });
        return;
      }
      if (seenImages.has(img)) {
        warnings.push({
          id: pid,
          message: `Image "${img}" is used by ${seenImages.get(img)} and ${display}.`,
        });
      } else {
        seenImages.set(img, display);
      }
    });

    (p?.badges || []).forEach((b, j) => {
      if (b && b.text && !BADGE_STYLES.includes(b.style)) {
        errors.push({ id: pid, message: `${display}: badge ${j + 1} uses unknown style "${b.style}".` });
      }
    });

    if (p?.specs !== undefined && !Array.isArray(p.specs)) {
      errors.push({ id: pid, message: `${display}: specs must be a list.` });
    }

    if (p?.publishAt) {
      const t = new Date(p.publishAt).getTime();
      if (!Number.isFinite(t)) {
        errors.push({ id: pid, message: `${display}: "publish on" date is not valid.` });
      }
    }
  });

  return { errors, warnings };
}

/**
 * Live-network probe of every image reference using an <img> element — unlike
 * fetch(), image loads are never blocked by CORS, so this works against the
 * CDN and the same-origin repo images alike. References to photos that will be
 * uploaded during this publish (pendingTargets) are skipped.
 * Returns { missing, checked }.
 */
export async function findBrokenImages(products, pendingTargets = new Set()) {
  // Image-element probing only works in a browser (no `Image` global in Node),
  // where it matters — unit tests just assert the skip/structural logic.
  if (typeof Image !== "function") return { missing: [], checked: 0 };

  const targets = new Map(); // url -> display path
  for (const p of Array.isArray(products) ? products : []) {
    for (const img of imgsOf(p)) {
      if (/^data:image\//i.test(img) || pendingTargets.has(img)) continue;
      const url = imgUrl(img);
      if (url && !targets.has(url)) targets.set(url, img);
    }
  }

  const probe = (url) =>
    new Promise((resolve) => {
      const el = new Image();
      const timer = setTimeout(() => {
        el.src = "";
        resolve(false);
      }, 8000);
      el.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };
      el.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      el.src = url;
    });

  const missing = [];
  const urls = [...targets.keys()];
  // Probe a few at a time so slow/broken CDN paths don't starve the rest.
  for (let i = 0; i < urls.length; i += 6) {
    const batch = await Promise.all(urls.slice(i, i + 6).map(probe));
    batch.forEach((ok, j) => {
      if (!ok) missing.push(targets.get(urls[i + j]));
    });
  }

  return { missing, checked: urls.length };
}

// Lowercased-id lookup maps (ids are case-insensitive slugs).
const indexById = (products) => {
  const map = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    if (p && p.id) map.set(String(p.id).trim().toLowerCase(), p);
  }
  return map;
};

const sameJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

/**
 * Draft / published / scheduled / modified classification for every local
 * product against the live snapshot. `removed` lists products present in the
 * live site but no longer in the local draft (they'd be deleted on publish).
 */
export function computeStatuses(products, live, now = new Date()) {
  const liveById = indexById(live);
  const statuses = new Map();

  for (const p of Array.isArray(products) ? products : []) {
    const key = String(p?.id || "").trim().toLowerCase();
    if (!key) {
      statuses.set(key, { status: "draft", product: p, live: null });
      continue;
    }
    const liveP = liveById.get(key);
    let status = "draft";
    if (isScheduled(p, now)) status = "scheduled";
    else if (liveP) status = sameJson(p, liveP) ? "published" : "modified";
    statuses.set(key, { status, product: p, live: liveP || null });
  }

  const liveKeySet = new Set(Array.isArray(products) ? products.map((p) => String(p?.id || "").trim().toLowerCase()) : []);
  const removed = Array.isArray(live)
    ? live.filter((lp) => lp && lp.id && !liveKeySet.has(String(lp.id).trim().toLowerCase()))
    : [];

  return { statuses, removed };
}

/**
 * One-line counts for the publish confirmation dialog.
 */
export function summarizeChanges(products, live, now = new Date()) {
  const byId = indexById(products);
  const liveById = indexById(live);
  let added = 0;
  let updated = 0;
  let scheduled = 0;

  for (const p of Array.isArray(products) ? products : []) {
    const key = String(p?.id || "").trim().toLowerCase();
    const liveP = key ? liveById.get(key) : null;
    if (!liveP) added += 1;
    else if (!sameJson(p, liveP)) updated += 1;
    if (isScheduled(p, now)) scheduled += 1;
  }

  const deleted = Array.isArray(live)
    ? live.filter((lp) => {
        if (!lp || !lp.id) return false;
        const key = String(lp.id).trim().toLowerCase();
        return key ? !byId.has(key) : false;
      }).length
    : 0;

  return { added, updated, deleted, scheduled };
}

export { isScheduled };