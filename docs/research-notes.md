# Provider Contract Notes (verified 2026-07)

Contracts below were researched against provider-owned sources and adversarially re-verified
(jfa-go: line-by-line against the upstream Go source on `hrfee/jfa-go` main; NOWPayments: official
help-center articles, the APIs-guru mirror of the official OpenAPI spec, and NOWPayments' own
published plugin/SDK source).

## jfa-go (all verified against upstream source)

- **Auth**: `GET /token/login` with HTTP **Basic** auth (jfa-go `[ui]` admin or Jellyfin admin
  credentials) → `{"token": "<JWT>"}`. Tokens live **20 minutes**; the signing secret is
  regenerated on every jfa-go restart, so **no static API key exists**. All other routes use
  `Authorization: Bearer <token>`. The portal caches the token for 15 minutes and re-logs-in on 401
  (`api/src/services/jfago.ts`).
- **List users**: `GET /users` → always `{"users": [...], "last_page": bool}` (never a bare
  array). Username field is `name`; `expiry`/`last_active` are Unix **seconds**.
- **Set expiry**: `POST /users/extend` with
  `{"users": ["<jellyfin user ID>"], "timestamp": <unix seconds>}` (absolute; or relative
  `months/days/hours/minutes`). Success is **HTTP 204 with an empty body** — do not call
  `res.json()` unconditionally. The route `POST /users/{username}/expiry` used by an earlier
  revision **does not exist**.
- **Create invite**: `POST /invites` with hyphenated keys
  (`"user-expiry"`, `"user-months"`, `"user-days"`, `"multiple-uses"`, `"remaining-uses"`) plus
  `profile`, `label`, `user_label`. The response is only `{"success": true}` — the generated code
  is **not returned**; set a unique `label` (we use the order id) and recover the code from
  `GET /invites` (note: underscore keys there, `used_by` maps username → Unix seconds, response is
  `{"invites": null}` when empty, expired invites are purged server-side). Registration URL:
  `{external jfa-go URL}/invite/{code}`.
- **Apply profile to existing users**: `POST /users/settings` (`from: "profile"`); the expiry DTO
  has no profile field.

## NOWPayments

- **Invoice**: `POST {base}/v1/invoice` (`x-api-key`). Response has only `id` and `invoice_url`
  (`https://nowpayments.io/payment/?iid={id}`) — there is no `invoice_id`/`payment_url` field.
  `pay_currency` is optional (omit to let the customer pick the coin on the hosted page).
- **IPN**: POST to `ipn_callback_url` with header `x-nowpayments-sig` =
  HMAC-SHA512 over the JSON body with keys sorted recursively (our `api/src/lib/hash.ts`
  implementation is byte-equivalent to the official algorithm). **One IPN per status change, all
  sharing the same `payment_id`** — webhook idempotency must key on `payment_id:status`
  (implemented) or the `finished` notification is dropped as a duplicate. Respond HTTP 200
  quickly; retries default to 3 at 1-minute intervals (configurable in the dashboard).
- **Statuses**: `waiting → confirming → confirmed → sending → finished`, plus `partially_paid`,
  `failed`, `refunded`, `expired`. **Only `finished` means funds reached the merchant** —
  `confirmed` is just blockchain confirmations. `partially_paid` is practically terminal and needs
  manual handling. `expired` = customer did not pay within **7 days** of payment creation.
  ("cancelled" is not part of the payment API contract; we tolerate it defensively.)
- **Validation**: verify `price_amount`/`price_currency` against the stored order before
  provisioning (implemented in the webhook handler).
- **Reconciliation**: IPN retries are finite, so pending orders are lazily re-checked via
  `GET /v1/payment/{payment_id}` (same API key; `payment_id` is learned from the first IPN and
  persisted). There is no public invoice-status endpoint.
- **Sandbox**: `https://api-sandbox.nowpayments.io/v1` with a separate account from
  `https://account-sandbox.nowpayments.io`; `POST /v1/payment` accepts a sandbox-only
  `case: "success" | "failed" | "partially_paid"` field to simulate full status flows incl. IPNs.

## Azteco

- Public Azteco redemption is not a backend automation API. The real automatic flow needs reseller
  API credentials and its private endpoint/DTO contract.
- `RealAztecoClient` is intentionally present but blocked with TODO markers until that spec is
  supplied.
- `MockAztecoClient` supports local/CI voucher paths:
  - `0000-...` invalid
  - `1111-...` already redeemed
  - `2222-...` in progress
  - other valid-format codes redeem to a deterministic EUR amount (last two digits mod 4 →
    25/50/75/100 €).

## Plex

- `invitePlexUser` performs the share; eligibility is decided by the fulfillment engine from the
  paid plan (`Payment.plexState`), never by the caller. The exact sharing payload still needs to be
  wired against the deployment's server/library setup (TODO in `api/src/services/plex.ts`).
