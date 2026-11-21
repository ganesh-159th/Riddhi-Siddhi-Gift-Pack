import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const MIN_FILL_MS = 3_000; // form must take at least this long to fill
const RATE_LIMIT = 5; // max submissions per IP per window
const RATE_WINDOW_MS = 60_000; // 1 minute

// In-memory rate limit store: per-container limiting on warm Lambda containers.
// Each IP keyed to a rolling window.
const rateMap = new Map();
const prune = () => {
  const now = Date.now();
  for (const [key, hits] of rateMap) {
    rateMap.set(
      key,
      hits.filter((t) => now - t < RATE_WINDOW_MS)
    );
    if (rateMap.get(key).length === 0) rateMap.delete(key);
  }
};

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    },
  });

// Block text containing obvious spam: URLs/links, excessive characters, crypto/viagra style keywords.
const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+(\.[a-z0-9-]+)+\b/i;
const SPAM_RE =
  /\b(viagra|casino|bitcoin|forex|seo|insurance|loan|crypto|porn|buy now|click here|free money|earn money|make money|xrp|fdgfi|maomao)\b/i;
const GARBAGE_RE = /(.)\1{4,}|[<>{}[\]\\^`|~@$%#*+=]/;

const clean = (v) => (typeof v === "string" ? v.trim().slice(0, 500) : "");

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  prune();

  // ---- rate limiting ----
  const now = Date.now();
  const hits = (rateMap.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    return json(429, { ok: false, error: "Too many submissions. Please wait a moment and try again." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid request body." });
  }

  // ---- honeypot fields (must be empty) ----
  if (clean(body.tf_hp_name) || clean(body.tf_hp_email)) {
    return json(200, { ok: true, honeypot: true }); // silently swallow bots
  }
  if (clean(body.bot_field)) {
    return json(200, { ok: true, honeypot: true });
  }

  // ---- time-based check: human takes >= 3s to complete the form ----
  const fillMs = Number(body.tf_fill_ms);
  if (!fillMs || isNaN(fillMs) || fillMs < MIN_FILL_MS) {
    return json(200, { ok: true, honeypot: true });
  }

  // ---- content filtering ----
  const name = clean(body.name);
  const message = clean(body.message);
  const phone = clean(body.phone);
  if (!name || !phone || !message) {
    return json(400, { ok: false, error: "Name, phone and message are required." });
  }
  if (name.length > 80 || name.length < 2 || URL_RE.test(name) || SPAM_RE.test(name) || GARBAGE_RE.test(name)) {
    return json(400, { ok: false, error: "Please enter a valid business or contact name." });
  }
  if (SPAM_RE.test(message) || GARBAGE_RE.test(message)) {
    return json(400, { ok: false, error: "Your message looks like spam. Please rephrase and try again." });
  }
  if (!/^[+0-9][0-9 ().-]{6,16}$/.test(phone)) {
    return json(400, { ok: false, error: "Please enter a valid phone number." });
  }

  // Record a successful hit for rate limiting
  hits.push(now);
  rateMap.set(ip, hits);

  const bucket = process.env.ENQUIRIES_BUCKET;
  if (!bucket) return json(500, { ok: false, error: "Lead storage is not configured." });

  const submittedAt = new Date();
  const day = submittedAt.toISOString().slice(0, 10);
  const enquiry = {
    id: randomUUID(),
    form: "enquiry",
    submittedAt: submittedAt.toISOString(),
    name,
    phone,
    product: clean(body.product),
    quantity: clean(body.quantity),
    message,
  };

  try {
    const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `enquiries/${day}/${enquiry.id}.json`,
        Body: JSON.stringify(enquiry, null, 2),
        ContentType: "application/json",
      })
    );
  } catch {
    return json(502, { ok: false, error: "Could not save the enquiry. Please try again." });
  }

  return json(200, { ok: true });
};
