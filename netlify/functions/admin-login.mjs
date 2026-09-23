import { createHash, timingSafeEqual } from "node:crypto";
import { signSession } from "../lib/session.mjs";

// Admin login (issue #18): verifies the password against ADMIN_TOKEN and, on
// success, returns a short-lived signed session token. Every later admin call
// (presign-image, process-image, save-products) re-verifies that token.
// No new AWS/services — pure HMAC signing inside the existing Netlify function.

const JSON_STATIC = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: JSON_STATIC });

// Constant-time comparison that is safe even when the two inputs differ in
// length: both sides are hashed to a fixed size first, so no length-leak and
// no timing difference. Tolerates stray whitespace (e.g. a newline pasted into
// the Netlify env editor) via trim() by the caller.
const safeEqual = (a, b) => {
  const hab = createHash("sha256").update(String(a)).digest();
  const hbb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(hab, hbb);
};

export default async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { ok: false, message: "Method not allowed" });

  const password = (process.env.ADMIN_TOKEN || "").trim();
  const secret = process.env.JWT_SECRET;

  if (!password || !secret) {
    return json(500, {
      ok: false,
      message: "Server is missing ADMIN_TOKEN / JWT_SECRET. Set them in Netlify site settings.",
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, message: "Invalid JSON body." });
  }

  if (!body.password || !safeEqual(body.password, password)) {
    return json(401, { ok: false, message: "Invalid admin password." });
  }

  const { token, exp } = signSession(secret, process.env.SESSION_TTL_HOURS);
  return json(200, { ok: true, token, exp, expiresIn: Math.floor((exp - Date.now()) / 1000) });
};