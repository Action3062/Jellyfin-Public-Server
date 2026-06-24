import { config } from "../config.js";

export type AztecoRedeemResult = {
  status: "redeemed" | "already_redeemed" | "invalid" | "in_progress";
  value_eur: number;
  tx_ref?: string;
};

export interface AztecoClient {
  redeem(code: string): Promise<AztecoRedeemResult>;
}

export class MockAztecoClient implements AztecoClient {
  async redeem(code: string): Promise<AztecoRedeemResult> {
    const digits = code.replace(/-/g, "");
    if (digits.startsWith("0000")) return { status: "invalid", value_eur: 0 };
    if (digits.startsWith("1111")) return { status: "already_redeemed", value_eur: 0 };
    if (digits.startsWith("2222")) return { status: "in_progress", value_eur: 0 };
    const last = Number(digits.slice(-2));
    const value = [25, 50, 75, 100][last % 4];
    return { status: "redeemed", value_eur: value, tx_ref: `mock-${digits.slice(-6)}` };
  }
}

export class RealAztecoClient implements AztecoClient {
  async redeem(_code: string): Promise<AztecoRedeemResult> {
    if (!config.AZTECO_RESELLER_API_BASE || !config.AZTECO_RESELLER_API_KEY) {
      throw new Error("Azteco reseller API is not configured");
    }

    // TODO: Replace this placeholder with the official Azteco Reseller API redeem endpoint and DTOs
    // once the reseller specification is available. The public azte.co voucher flow redeems to a
    // wallet and is not suitable for automatic server-side activation.
    throw new Error("Azteco reseller API adapter TODO: endpoint and fields pending");
  }
}

export function createAztecoClient(): AztecoClient {
  return config.AZTECO_CLIENT_MODE === "real" ? new RealAztecoClient() : new MockAztecoClient();
}
