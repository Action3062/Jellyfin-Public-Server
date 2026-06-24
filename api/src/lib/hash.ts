import crypto from "node:crypto";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObject((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function nowpaymentsSignature(payload: unknown, secret: string) {
  return crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(sortObject(payload)))
    .digest("hex");
}

export function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
