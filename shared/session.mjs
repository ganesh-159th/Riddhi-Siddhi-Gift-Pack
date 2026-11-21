import { createHmac, timingSafeEqual } from "node:crypto";

// Admin session tokens (issue #18). Stateless, signed with HMAC-SHA256 using a
// secret only the backend knows (JWT_SECRET). No cookies, no external
// store, no extra cost — the token travels in the request body and every
// admin function re-verifies it before doing work.
//
// Format: base64url(JSON { sub, iat, exp }).base64url(hmac)
// The client never sees the secret and cannot forge a session.

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (s) => Buffer.from(s, "base64url");

export function signSession(secret, ttlHours) {
  const iat = Date.now();
  const exp = iat + (Number.isFinite(Number(ttlHours)) && Number(ttlHours) > 0 ? Number(ttlHours) : 12) * 3600_000;
  const payload = b64url(JSON.stringify({ sub: "admin", iat, exp }));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return { token: `${payload}.${sig}`, exp };
}

export function verifySession(token, secret) {
  if (!secret || !token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  let given;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let data;
  try {
    data = JSON.parse(fromB64url(payload).toString("utf8"));
  } catch {
    return null;
  }
  if (data.sub !== "admin" || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
  return data;
}