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
      success_url: `${config.PUBLIC_BASE_URL}/pay?status=success`,
      cancel_url: `${config.PUBLIC_BASE_URL}/pay?status=cancelled`
    })
  });

  const data = await res.json() as { id?: string | number; invoice_id?: string | number; invoice_url?: string; payment_url?: string; message?: string };
  if (!res.ok) throw new Error(data.message || "NowPayments invoice creation failed");

  return {
    invoice_id: String(data.invoice_id ?? data.id),
    invoice_url: String(data.invoice_url ?? data.payment_url)
  };
}

export function verifyNowPaymentsIpn(payload: unknown, header: string | undefined) {
  // Fail closed: without an IPN secret we cannot verify the signature, so reject
  // every webhook regardless of NODE_ENV (prevents forged "finished" callbacks).
  if (!config.NOWPAYMENTS_IPN_SECRET) return false;
  if (!header) return false;
  const expected = nowpaymentsSignature(payload, config.NOWPAYMENTS_IPN_SECRET);
  return timingSafeEqual(expected, header);
}
