import { config } from "../config.js";
import { nowpaymentsSignature, timingSafeEqual } from "../lib/hash.js";

type InvoiceInput = {
  orderId: string;
  priceEur: number;
  coin: string;
  description: string;
};

export async function createNowPaymentsInvoice(input: InvoiceInput) {
  if (!config.NOWPAYMENTS_API_KEY) {
    return {
      invoice_id: `mock_${input.orderId}`,
      invoice_url: `${config.PUBLIC_BASE_URL}/pay/mock-invoice/${input.orderId}`
    };
  }

  const res = await fetch(`${config.NOWPAYMENTS_BASE_URL}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.NOWPAYMENTS_API_KEY
    },
    body: JSON.stringify({
      price_amount: input.priceEur,
      price_currency: "EUR",
      pay_currency: input.coin,
      order_id: input.orderId,
      order_description: input.description,
      ipn_callback_url: `${config.API_PUBLIC_BASE_URL}/api/webhooks/nowpayments`,
      success_url: `${config.PUBLIC_BASE_URL}/order/${input.orderId}`,
      cancel_url: `${config.PUBLIC_BASE_URL}/pay?status=cancelled`
    })
  });

  // The invoice response carries only `id` and `invoice_url`
  // (https://nowpayments.io/payment/?iid={id}).
  const data = (await res.json()) as { id?: string | number; invoice_url?: string; message?: string };
  if (!res.ok) throw new Error(data.message || "NowPayments invoice creation failed");

  return {
    invoice_id: String(data.id),
    invoice_url: String(data.invoice_url)
  };
}

/**
 * Server-side reconciliation poll. IPN retries are finite (default: 3 tries,
 * 1-minute apart), so pending payments are re-checked against
 * GET /v1/payment/{payment_id} — authenticated with the same API key that
 * created the payment. payment_id becomes known via the first IPN.
 */
export async function getNowPaymentsStatus(paymentId: string): Promise<{ payment_status: string } | null> {
  if (!config.NOWPAYMENTS_API_KEY) return null;
  const res = await fetch(`${config.NOWPAYMENTS_BASE_URL}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { "x-api-key": config.NOWPAYMENTS_API_KEY }
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { payment_status?: string };
  return data.payment_status ? { payment_status: data.payment_status } : null;
}

/**
 * Verify an IPN callback. Fail closed: unsigned webhooks are only accepted
 * in pure mock mode (no API key configured outside production), where no
 * real NOWPayments account exists and the webhook can only be exercised by
 * local tooling.
 */
export function verifyNowPaymentsIpn(payload: unknown, header: string | undefined) {
  if (!config.NOWPAYMENTS_IPN_SECRET) {
    return config.NODE_ENV !== "production" && !config.NOWPAYMENTS_API_KEY;
  }
  if (!header) return false;
  const expected = nowpaymentsSignature(payload, config.NOWPAYMENTS_IPN_SECRET);
  return timingSafeEqual(expected, header);
}
