# Payment Portal

Privacy-focused Jellyfin/Plex subscription portal: marketing landing page, crypto/voucher checkout, tokenized order tracking, and a claim-token dashboard — Next.js frontend with a Fastify companion backend.

## Stack

- Frontend: Next.js App Router, TypeScript, component-based UI (`web/components`), dictionary-based DE/EN i18n, Inter via `next/font`
- Backend: Fastify, TypeScript, Prisma/PostgreSQL, BullMQ/Redis
- Payments: NOWPayments invoices/IPN, Azteco adapter with mock and real-client TODO boundary
- Provisioning: jfa-go (expiry extension for existing users, single-use registration invites for new users), Plex invite for eligible plans
- Artwork: Higgsfield Cinema Studio imagery, fetched at build time (`web/scripts/fetch-assets.mjs`) with pure-CSS gradient fallbacks
- Testing: Vitest (API), Playwright e2e (desktop + mobile, DE/EN, full checkout flows in provider mock mode)
- Deployment: Docker Compose with an internal backend network (postgres/redis unreachable from the host), non-root containers

## Information architecture

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing (hero, features, pricing, FAQ, DE/EN) |
| `/pay` | Checkout: plan/coin or Azteco voucher + explicit "existing account / new here" step |
| `/order/[orderId]` | Tokenized order page (`#t=<claim token>`): payment status, activation, Plex status. NOWPayments `success_url` points here. |
| `/register/[orderId]` | Portal-hosted registration for paid new-account orders (username + password, fully in portal branding — jfa-go's UI is never shown) |
| `/dashboard` | Claim-token dashboard: subscription status, expiry, payment history, renew CTA |
| `/admin` | Operator panel (separate login + optional TOTP 2FA): revenue KPIs, manual time credits, payment/webhook/voucher drill-downs, user directory with drift/abuse reports, Discord-bot remote control, health checks, audit log |
| `/pay/mock-invoice/[orderId]` | Dev-only stand-in for the hosted invoice (mock mode) |
| `/impressum`, `/datenschutz` | Legal pages (fill in operator details before going live) |

**Access model (no accounts, no e-mail):** every order returns a one-time `claim_token`; only its SHA-256 hash is stored. The token travels in the URL fragment (never in server logs) and is the key to the order page, registration, and the dashboard. New customers register on the portal's own `/register` page; the account is created through jfa-go's admin API (`POST /user` + `POST /users/extend`) with the purchased duration as expiry. The chosen password is forwarded to the media server and never persisted by the portal.

## Deployment

On a server with Docker (compose v2): `./deploy.sh` — creates `infra/.env` from the example on first run, then builds the images, starts the stack, applies migrations, and runs health checks. Follow the printed one-time steps afterwards (jfa-go setup, reverse proxy, env values).

## Local setup

1. Copy `infra/.env.example` to `infra/.env` and fill provider secrets (`POSTGRES_PASSWORD` is mandatory for compose).
2. `npm install`
3. `npm --workspace api run prisma:generate`
4. Start Postgres/Redis (e.g. `docker compose -f infra/docker-compose.yml up postgres redis`).
5. `npm --workspace api run prisma:migrate && npm run dev`

With no provider keys configured everything runs in mock mode: invoices resolve to `/pay/mock-invoice/...` with a "simulate payment" button, jfa-go lookups treat 3+ character usernames as existing, and invites use mock URLs.

## Testing

```bash
npm test                 # API unit tests (Vitest)
npm run test:e2e         # Playwright: desktop + mobile projects, DE/EN, all checkout flows
```

The e2e config boots both dev servers and expects Postgres on `127.0.0.1:5433` and Redis on `127.0.0.1:6379` (override with `E2E_DATABASE_URL` / `E2E_REDIS_URL`; set `PW_SYSTEM_CHROMIUM=1` to use a preinstalled Chromium).

## API contract

- `GET  /pay/api/products` — plans incl. `label_de`/`label_en`, `includes_plex`
- `GET  /pay/api/azteco/options`
- `POST /pay/api/user/check` — `{username}` → `{exists}` (tightly rate-limited)
- `POST /pay/api/nowpayments/create` — `{plan_id, coin, account_mode: "existing"|"new", jellyfin_username?, plex_username?}` → `{order_id, claim_token, invoice_id, invoice_url, ...}`
- `POST /pay/api/azteco/redeem` — `{code, account_mode, jellyfin_username?, plex_username?}` → `{value_eur, order_id, claim_token}` (new accounts: one voucher per order)
- `GET  /pay/api/order/:orderId` — header `x-claim-token`; returns payment phase, provisioning state, plex status; performs lazy NOWPayments reconciliation
- `POST /pay/api/register/check` — `{username}` → `{available}`
- `POST /pay/api/register` — `{order_id, claim_token, username, password}` → creates the Jellyfin account with the purchased duration (409 on taken username / unpaid / already registered)
- `POST /pay/api/dashboard` — `{token}` → subscription status, expiry, payment history
- `POST /api/webhooks/nowpayments` — HMAC-SHA512-verified IPN (event identity = `payment_id:status`, one IPN per status change)
- `POST /pay/api/dev/simulate-payment` — mock mode only, never mounted in production

Legacy field note: `discord_user` is still accepted as an alias for `jellyfin_username`.

## Admin & Discord bot

The `/admin` panel is enabled by setting `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET`; sessions are HMAC-signed tokens (8h, refreshable up to 7 days) and TOTP 2FA can be enabled inside the panel. Every sensitive action lands in the `AdminAuditLog` table. The Discord bot integrates over HTTP (`/pay/api/bot/*`, `/pay/api/trial/status`): reads are public, writes require the shared `BOT_API_SECRET`; the panel can toggle trial handouts, override bot feature flags, set support status, and queue commands (e.g. trial resets) that the bot polls. Feature switches: `AZTECO_ENABLED` (checkout tab + API gate) and `PLEX_ENABLED` (UI visibility).

## Provider integration notes

- **jfa-go** is backend-only (customers never see it): the portal creates accounts via `POST /user` and sets the purchased duration via `POST /users/extend` (Jellyfin user IDs + Unix-seconds timestamp, success = HTTP 204). There are no long-lived API keys — `GET /token/login` (Basic auth) returns a 20-minute JWT whose signing secret rotates on restart, so configure `JFA_GO_USERNAME`/`JFA_GO_PASSWORD`. Set `JELLYFIN_PUBLIC_URL` for the post-registration "log in now" button. See `docs/research-notes.md` for the source-verified contract.
- **NOWPayments**: only `finished` means paid ("confirmed" ≠ funds received). Sandbox: `NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1` with a separate sandbox account.
- **Azteco**: keep `AZTECO_CLIENT_MODE=mock` until the reseller API spec is available.

## Artwork

`npm run fetch-assets` downloads the Higgsfield-generated cinematic imagery into `web/public/assets` (WebP via sharp when available). The Docker web build runs it automatically; when the CDN is unreachable the UI keeps its gradient fallbacks.
