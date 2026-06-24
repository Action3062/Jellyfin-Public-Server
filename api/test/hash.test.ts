import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { nowpaymentsSignature, sortObject } from "../src/lib/hash.js";

describe("NowPayments IPN signature", () => {
  it("sorts object keys recursively before HMAC-SHA512", () => {
    const payload = { z: 1, a: { c: 3, b: 2 } };
    const expectedPayload = JSON.stringify({ a: { b: 2, c: 3 }, z: 1 });
    const expected = crypto.createHmac("sha512", "secret").update(expectedPayload).digest("hex");
    expect(sortObject(payload)).toEqual({ a: { b: 2, c: 3 }, z: 1 });
    expect(nowpaymentsSignature(payload, "secret")).toBe(expected);
  });
});
