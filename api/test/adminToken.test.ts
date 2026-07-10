import { describe, expect, it } from "vitest";
import { signAdminToken, verifyAdminToken } from "../src/lib/adminToken.js";

const SECRET = "test-secret";

describe("admin token", () => {
  it("round-trips sub and defaults orig to now", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signAdminToken("admin", SECRET, 3600);
    const claims = verifyAdminToken(token, SECRET);
    expect(claims?.sub).toBe("admin");
    expect(claims?.orig).toBeGreaterThanOrEqual(before);
    expect(claims?.exp).toBeGreaterThan(before);
  });

  it("carries an explicit orig forward (refresh semantics)", () => {
    const orig = Math.floor(Date.now() / 1000) - 6 * 24 * 60 * 60; // 6 days ago
    const refreshed = signAdminToken("admin", SECRET, 3600, orig);
    expect(verifyAdminToken(refreshed, SECRET)?.orig).toBe(orig);
  });

  it("rejects expired tokens", () => {
    const token = signAdminToken("admin", SECRET, -10);
    expect(verifyAdminToken(token, SECRET)).toBeNull();
  });

  it("rejects a tampered payload or wrong secret", () => {
    const token = signAdminToken("admin", SECRET, 3600);
    const [data, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ sub: "evil", exp: 9999999999, orig: 0 })).toString("base64url")}.${sig}`;
    expect(verifyAdminToken(forged, SECRET)).toBeNull();
    expect(verifyAdminToken(`${data}.${sig}`, "other-secret")).toBeNull();
  });
});
