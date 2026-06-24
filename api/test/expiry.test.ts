import { describe, expect, it } from "vitest";
import { addDays, addMonths, laterOf } from "../src/lib/expiry.js";

describe("expiry calculation", () => {
  it("adds days for Azteco vouchers", () => {
    expect(addDays(new Date("2026-01-01T00:00:00Z"), 53).toISOString()).toBe("2026-02-23T00:00:00.000Z");
  });

  it("handles end-of-month monthly plans", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("extends from the later active expiry date", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const active = new Date("2026-03-01T00:00:00Z");
    expect(laterOf(now, active)).toBe(active);
  });
});
