import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { base32Decode, base32Encode, generateTotpSecret, totpAuthUri, verifyTotp } from "../src/lib/totp.js";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
      const buf = Buffer.from(text);
      expect(base32Decode(base32Encode(buf)).toString()).toBe(text);
    }
  });

  it("matches known RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });
});

describe("verifyTotp", () => {
  const secret = generateTotpSecret();

  it("accepts a freshly generated code and rejects a wrong one", () => {
    const now = 1_700_000_000_000;
    const key = base32Decode(secret);
    // Recompute the expected code the same way the implementation does.
    const counter = Math.floor(now / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
    const code = String(bin % 1_000_000).padStart(6, "0");

    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
  });

  it("tolerates one step of clock drift but not two", () => {
    const now = 1_700_000_000_000;
    const key = base32Decode(secret);
    const codeAt = (t: number) => {
      const counter = Math.floor(t / 1000 / 30);
      const buf = Buffer.alloc(8);
      buf.writeUInt32BE(0, 0);
      buf.writeUInt32BE(counter >>> 0, 4);
      const hmac = crypto.createHmac("sha1", key).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0x0f;
      const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
      return String(bin % 1_000_000).padStart(6, "0");
    };
    const prev = codeAt(now - 30_000);
    const twoBack = codeAt(now - 60_000);
    expect(verifyTotp(secret, prev, now)).toBe(true);
    expect(verifyTotp(secret, twoBack, now)).toBe(false);
  });

  it("builds a valid otpauth uri", () => {
    const uri = totpAuthUri(secret, "admin", "BYTEFLIX");
    // The label is URL-encoded, so the colon becomes %3A.
    expect(uri).toContain("otpauth://totp/BYTEFLIX%3Aadmin");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=BYTEFLIX");
  });
});
