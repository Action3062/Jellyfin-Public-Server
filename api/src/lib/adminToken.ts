import crypto from "node:crypto";

// Minimal HMAC-signed token (data.signature) for the admin session. Avoids an
// extra JWT dependency; the secret comes from ADMIN_SESSION_SECRET.

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export type AdminClaims = { sub: string; exp: number };

export function signAdminToken(sub: string, secret: string, ttlSeconds: number) {
  const claims: AdminClaims = { sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyAdminToken(token: string | undefined, secret: string): AdminClaims | null {
  if (!token || !secret) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = b64url(crypto.createHmac("sha256", secret).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(fromB64url(data).toString("utf8")) as AdminClaims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (hashes first so lengths always match). */
export function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
