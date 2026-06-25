# Live Verification Notes

These are the integration points that must be checked against provider-owned documentation during deployment.

## NowPayments

- Invoice creation is isolated in `api/src/services/nowpayments.ts`.
- IPN verification uses the `x-nowpayments-sig` header and HMAC-SHA512 over the alphabetically sorted JSON payload.
- Provisioning is queued only after `payment_status === "finished"`.
- Accepted terminal/failure states are represented in the route layer: `finished`, `confirmed`, `completed`, `failed`, `expired`, `refunded`.

## jfa-go

- `api/src/services/jfago.ts` keeps user lookup and expiry extension behind one adapter.
- Auth: jfa-go has no static API key. The adapter logs in via `GET /token/login` (Basic auth, `JFA_GO_USER`/`JFA_GO_PASSWORD`) to obtain a short-lived JWT and caches it.
- User existence is verified via the Jellyfin API (see `jellyfin.ts`); jfa-go is only the fallback lookup.
- Expiry is set via `POST /users/extend` with the resolved Jellyfin user `id` and an absolute `timestamp` (Unix seconds), `try_extend_from_previous_expiry: false` — idempotent on job retries.
- When jfa-go is not configured, `extendJellyfinExpiry` is a no-op mock so local/CI runs do not fail.

## Azteco

- Public Azteco redemption is not a backend automation API. The real automatic flow needs reseller API credentials and its private endpoint/DTO contract.
- `RealAztecoClient` is intentionally present but blocked with TODO markers until that spec is supplied.
- `MockAztecoClient` supports local/CI voucher paths:
  - `0000-...` invalid
  - `1111-...` already redeemed
  - `2222-...` in progress
  - other valid-format codes redeem to a deterministic EUR amount.
