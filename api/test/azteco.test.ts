import { describe, expect, it } from "vitest";
import { MockAztecoClient } from "../src/services/azteco.js";

describe("MockAztecoClient", () => {
  it("returns invalid for 0000-prefixed codes", async () => {
    await expect(new MockAztecoClient().redeem("0000-1234-5678-9012")).resolves.toMatchObject({
      status: "invalid",
      value_eur: 0
    });
  });

  it("returns already redeemed for 1111-prefixed codes", async () => {
    await expect(new MockAztecoClient().redeem("1111-1234-5678-9012")).resolves.toMatchObject({
      status: "already_redeemed",
      value_eur: 0
    });
  });

  it("returns deterministic EUR value for valid mock codes", async () => {
    await expect(new MockAztecoClient().redeem("9999-1234-5678-9012")).resolves.toMatchObject({
      status: "redeemed",
      value_eur: 25
    });
  });
});
