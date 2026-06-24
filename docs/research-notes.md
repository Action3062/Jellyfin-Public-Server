# Live Verification Notes

These are the integration points that must be checked against provider-owned documentation during deployment.

## NowPayments

- Invoice creation is isolated in `api/src/services/nowpayments.ts`.
- IPN verification uses the `x-nowpayments-sig` header and HMAC-SHA512 over the alphabetically sorted JSON payload.
- Provisioning is queued only after `payment_status === "finished"`.
- Accepted terminal/failure states are represented in the route layer: `finished`, `confirmed`, `completed`, `failed`, `expired`, `refunded`.

## jfa-go

- `api/src/services/jfago.ts` keeps user lookup and expiry extension behind one adapter.
- The expiry route is marked with a TODO because the exact local jfa-go Swagger route/DTO should be verified against the instance at `/swagger/index.html`.
- The service returns mock-positive checks when `JFA_GO_TOKEN` is empty so local UI work and integration tests can run.

## Azteco

- Public Azteco redemption is not a backend automation API. The real automatic flow needs reseller API credentials and its private endpoint/DTO contract.
- `RealAztecoClient` is intentionally present but blocked with TODO markers until that spec is supplied.
- `MockAztecoClient` supports local/CI voucher paths:
  - `0000-...` invalid
  - `1111-...` already redeemed
  - `2222-...` in progress
  - other valid-format codes redeem to a deterministic EUR amount.
