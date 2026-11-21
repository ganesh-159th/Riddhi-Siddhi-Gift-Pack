import { S3_BUCKET_KEY_RE, LEGACY_IMAGE_RE } from "./images.mjs";

// Server-side validation for the products array written to public/products.json
// (issue #23). The admin panel validates in the browser (src/admin/validate.js),
// but that check can be skipped by anyone who can reach the function, so the
// same rules are enforced here before anything is committed to GitHub.
//
// Errors are returned as { id, message } so the panel can show them verbatim.

const FULL_URL_RE = /^https?:\/\//i;
const DATA_IMAGE_RE = /^data:image\//i;
const BADGE_STYLES = ["gold", "wine", "ink"];

// Generous bounds — the goal is to stop corrupt or hostile payloads, not to
// second-guess the copy an admin typed.
export const LIMITS = {
  products: 500,
  name: 120,
  tagline: 200,
  alt: 200,
  quoteNote: 300,
  specs: 40,
  specLength: 120,
  badges: 8,
  badgeText: 40,
  images: 12,
  id: 60,
};

const isPublishableImage = (path) =>
  S3_BUCKET_KEY_RE.test(path) || LEGACY_IMAGE_RE.test(path) || FULL_URL_RE.test(path);

export const imgsOf = (p) =>
  (p && p.images && p.images.length ? p.images : [p && p.image]).filter(Boolean);

/**
 * Structural validation of a products array, mirroring the browser rules in
 * src/admin/validate.js but hardened for untrusted input.
 * Returns { errors, warnings }; `errors` blocks the write.
 */
export function validateProducts(products) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(products)) {
    return { errors: [{ id: "", message: 'A "products" array is required.' }], warnings };
  }

  if (products.length > LIMITS.products) {
    errors.push({
      id: "",
      message: `Too many products (${products.length}). The limit is ${LIMITS.products}.`,
    });
    return { errors, warnings };
  }

  const seenIds = new Map();
  const seenImages = new Map();

  products.forEach((p, i) => {
    const display = String(p?.name || `Product #${i + 1}`).trim().slice(0, LIMITS.name);
    const pid = String(p?.id || "");

    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      errors.push({ id: "", message: `${display}: must be an object.` });
      return;
    }

    if (!String(p.name || "").trim()) {
      errors.push({ id: pid, message: `${display}: a product name is required.` });
    } else if (String(p.name).length > LIMITS.name) {
      errors.push({
        id: pid,
        message: `${display}: name is longer than ${LIMITS.name} characters.`,
      });
    }

    if (!pid.trim()) {
      errors.push({ id: pid, message: `${display}: the product id is missing.` });
    } else if (pid.length > LIMITS.id) {
      errors.push({
        id: pid,
        message: `${display}: product id is longer than ${LIMITS.id} characters.`,
      });
    } else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pid)) {
      errors.push({
        id: pid,
        message: `${display}: product id may only use letters, numbers, dots, dashes and underscores.`,
      });
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

    for (const field of ["tagline", "alt", "quoteNote"]) {
      const v = p[field];
      if (v !== undefined && v !== null && typeof v !== "string") {
        errors.push({ id: pid, message: `${display}: ${field} must be text.` });
      } else if (typeof v === "string" && v.length > LIMITS[field]) {
        errors.push({
          id: pid,
          message: `${display}: ${field} is longer than ${LIMITS[field]} characters.`,
        });
      }
    }

    const images = imgsOf(p);
    if (!images.length) {
      errors.push({ id: pid, message: `${display}: add at least one photo.` });
    } else if (images.length > LIMITS.images) {
      errors.push({
        id: pid,
        message: `${display}: has ${images.length} photos. The limit is ${LIMITS.images}.`,
      });
    }
    images.forEach((img) => {
      if (typeof img !== "string") {
        errors.push({ id: pid, message: `${display}: image references must be text.` });
        return;
      }
      if (FULL_URL_RE.test(img)) return;
      if (DATA_IMAGE_RE.test(img)) {
        errors.push({ id: pid, message: `${display}: "${img.slice(0, 40)}" is an un-uploaded photo.` });
        return;
      }
      if (!isPublishableImage(img)) {
        errors.push({ id: pid, message: `${display}: invalid image path "${img.slice(0, 60)}".` });
        return;
      }
      if (seenImages.has(img)) {
        warnings.push({
          id: pid,
          message: `Image "${img.slice(0, 60)}" is used by ${seenImages.get(img)} and ${display}.`,
        });
      } else {
        seenImages.set(img, display);
      }
    });

    if (p.badges !== undefined && p.badges !== null && !Array.isArray(p.badges)) {
      errors.push({ id: pid, message: `${display}: badges must be a list.` });
    } else if (Array.isArray(p.badges) && p.badges.length > LIMITS.badges) {
      errors.push({
        id: pid,
        message: `${display}: has ${p.badges.length} badges. The limit is ${LIMITS.badges}.`,
      });
    } else {
      (p.badges || []).forEach((b, j) => {
        if (!b || typeof b !== "object" || Array.isArray(b)) {
          errors.push({ id: pid, message: `${display}: badge ${j + 1} is not an object.` });
          return;
        }
        if (b.text !== undefined && typeof b.text !== "string") {
          errors.push({ id: pid, message: `${display}: badge ${j + 1} text must be text.` });
        } else if (typeof b.text === "string" && b.text.length > LIMITS.badgeText) {
          errors.push({
            id: pid,
            message: `${display}: badge ${j + 1} text is longer than ${LIMITS.badgeText} characters.`,
          });
        }
        if (b.text && !BADGE_STYLES.includes(b.style)) {
          errors.push({ id: pid, message: `${display}: badge ${j + 1} uses unknown style "${b.style}".` });
        }
      });
    }

    if (p.specs !== undefined && p.specs !== null && !Array.isArray(p.specs)) {
      errors.push({ id: pid, message: `${display}: specs must be a list.` });
    } else if (Array.isArray(p.specs)) {
      if (p.specs.length > LIMITS.specs) {
        errors.push({
          id: pid,
          message: `${display}: has ${p.specs.length} specs. The limit is ${LIMITS.specs}.`,
        });
      }
      p.specs.forEach((s, j) => {
        if (typeof s !== "string") {
          errors.push({ id: pid, message: `${display}: spec ${j + 1} must be text.` });
        } else if (s.length > LIMITS.specLength) {
          errors.push({
            id: pid,
            message: `${display}: spec ${j + 1} is longer than ${LIMITS.specLength} characters.`,
          });
        }
      });
    }

    if (p.imagesMeta !== undefined && p.imagesMeta !== null && !Array.isArray(p.imagesMeta)) {
      errors.push({ id: pid, message: `${display}: image metadata must be a list.` });
    } else if (Array.isArray(p.imagesMeta)) {
      p.imagesMeta.forEach((m, j) => {
        if (!m || typeof m !== "object" || Array.isArray(m)) {
          errors.push({ id: pid, message: `${display}: image metadata ${j + 1} is not an object.` });
          return;
        }
        if (typeof m.path !== "string" || !isPublishableImage(m.path)) {
          errors.push({
            id: pid,
            message: `${display}: image metadata ${j + 1} has an invalid path.`,
          });
        }
        for (const n of ["width", "height", "size"]) {
          if (m[n] !== undefined && (!Number.isFinite(m[n]) || m[n] < 0)) {
            errors.push({
              id: pid,
              message: `${display}: image metadata ${j + 1} has an invalid ${n}.`,
            });
          }
        }
      });
    }

    if (p.publishAt) {
      const t = new Date(p.publishAt).getTime();
      if (!Number.isFinite(t)) {
        errors.push({ id: pid, message: `${display}: "publish on" date is not valid.` });
      }
    }
  });

  return { errors, warnings };
}

/**
 * Validate and, when clean, return the products array with unknown keys
 * stripped so nothing unexpected lands in the repo. Returns
 * { products } on success or { errors } when the payload is rejected.
 */
export function prepareProducts(products) {
  const { errors } = validateProducts(products);
  if (errors.length) return { errors };

  const clean = products.map((p) => {
    const out = {};
    for (const k of ["id", "name", "tagline", "alt", "quoteNote", "publishAt"]) {
      if (typeof p[k] === "string" && p[k] !== "") out[k] = p[k];
    }
    if (Array.isArray(p.specs)) out.specs = p.specs.filter((s) => typeof s === "string");
    const images = imgsOf(p);
    if (images.length) {
      out.images = images;
      out.image = images[0];
    }
    if (Array.isArray(p.badges)) out.badges = p.badges;
    if (Array.isArray(p.imagesMeta)) out.imagesMeta = p.imagesMeta;
    return out;
  });

  return { products: clean };
}