# Payment Portal

Privacy-focused Jellyfin/Plex subscription payment portal with a Next.js frontend and a Node.js companion backend.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind-compatible design tokens, Inter via `next/font`
- Backend: Fastify, TypeScript, Prisma/PostgreSQL, BullMQ/Redis
- Payments: NowPayments invoices/IPN, Azteco adapter with mock and real-client TODO boundary
- Provisioning: jfa-go/Jellyfin expiry adapter, Plex invite adapter
- Deployment: Docker Compose for web, api, postgres, redis (jfa-go runs as its own container on the host and is reached via `JFA_GO_BASE_URL`)

Prisma is used because the payment/control-plane schema benefits from explicit migrations, generated types, and readable relational modeling.

## Layout

- `web`: payment UI at `/pay`
- `api`: backend endpoints under `/pay/api`, webhook under `/api/webhooks/nowpayments`
- `infra`: Dockerfiles, Compose, `.env.example`
- `docs`: provider verification notes

## Local Setup

1. Copy `infra/.env.example` to `infra/.env` and fill provider secrets.
2. Install dependencies with `npm install`.
3. Generate Prisma client with `npm --workspace api run prisma:generate`.
4. Start Postgres/Redis using `docker compose -f infra/docker-compose.yml up postgres redis`. (jfa-go runs as its own container on the host; set `JFA_GO_BASE_URL`, default `http://host.docker.internal:8056`.)
5. Run migrations/seeds, then start dev services:

```bash
npm --workspace api run prisma:migrate
npm run dev
```

## API Contract

- `GET /pay/api/products`
- `GET /pay/api/azteco/options`
- `GET /pay/api/trial/status`
- `POST /pay/api/user/check`
- `POST /pay/api/nowpayments/create`
- `GET /pay/api/nowpayments/status/:invoice_id`
- `POST /pay/api/azteco/redeem`
- `POST /pay/api/plex/invite`

Bot-facing (read endpoints public; write endpoints need `Authorization: Bearer $BOT_API_SECRET`):

- `GET /pay/api/trial/status` → `{ enabled, trial_hours, nudge_hours }`
- `GET /pay/api/bot/flags` → `{ flags: { <name>: true|false|null } }`
- `GET /pay/api/support/status` → `{ status, message }`
- `POST /pay/api/bot/heartbeat`
- `POST /pay/api/bot/report` (`kind` = `trials` | `tickets` | `funnel`)
- `GET /pay/api/bot/commands` / `POST /pay/api/bot/commands/ack`

Admin (Bearer token from `POST /admin/api/login`, optional TOTP):

- Auth: `POST /admin/api/login`, `POST /admin/api/refresh`, `GET /admin/api/2fa/status`, `POST /admin/api/2fa/{setup,enable,disable}`
- Dashboard: `GET /admin/api/dashboard`, `GET /admin/api/reconciliation`, `GET /admin/api/health`, `GET /admin/api/audit`
- Payments: `GET /admin/api/payments`, `GET /admin/api/webhooks`, `GET /admin/api/vouchers`, `GET /admin/api/export/payments.csv`
- Users: `GET /admin/api/users`, `GET /admin/api/users/:username`, `POST /admin/api/users/enable`, `GET /admin/api/expiry-preview`
- Credit: `POST /admin/api/credit`, `POST /admin/api/expiry/set`
- Queue: `GET /admin/api/queue`, `POST /admin/api/queue/retry`
- Settings & bot: `GET/POST /admin/api/settings`, `POST /admin/api/settings/trial`, `GET /admin/api/bot`, `POST /admin/api/bot/{flags,support,trial-params,command}`

Legacy field note: `discord_user` carries the Jellyfin username by design.

## Admin Dashboard

`/admin` is a tabbed dashboard (Übersicht, Gutschrift, Zahlungen, Nutzer, Discord, Betrieb, Einstellungen):

- **Übersicht** — revenue KPIs (`Payment` aggregates), monthly chart, provider split, top payers, alert banner.
- **Zahlungen** — filterable payment journal with NowPayments IPN drill-down (`WebhookEvent`), Azteco voucher log, CSV export.
- **Nutzer** — live jfa-go user list (expiry/disabled/source/revenue), expiring-soon quick-credit, enable/disable, per-user history, drift & abuse flags.
- **Discord** — remote feature-flag toggles, support status, trial parameters, trial reset, funnel history, bot heartbeat.
- **Betrieb** — integration health ampel, BullMQ queue monitor with retry, reconciliation warnings, audit log.
- **Einstellungen** — trial toggle, TOTP 2FA setup, session countdown/refresh, absolute-expiry correction. Dark/light + installable PWA.

State that isn't in the relational tables lives in `AppSetting` (trial toggle, feature flags, support status, trial params, bot heartbeat, TOTP). New tables: `AdminAuditLog`, `FunnelSnapshot`, `BotReport`, `BotCommand` — run `npm --workspace api run prisma:migrate` after pulling.

## Discord Bot Integration

The Discord bot (separate repo) polls the portal. The trial gate stays the core contract: the bot calls `GET /pay/api/trial/status` before handing out a trial and refuses when `enabled` is `false`; treat request errors as disabled (fail closed) so trials can't be farmed while the portal is down. With `PORTAL_BASE_URL` + `BOT_API_SECRET` set, the bot additionally pulls feature-flag/support overrides and pushes heartbeat, trial/ticket/funnel snapshots, and executes queued commands (e.g. trial reset).

## Sandbox Notes

- Leave `NOWPAYMENTS_API_KEY` empty for mock invoice URLs, or set `NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1` with a sandbox key.
- Keep `AZTECO_CLIENT_MODE=mock` until the reseller API spec is available.
- User checks query the Jellyfin API when `JELLYFIN_BASE_URL` and `JELLYFIN_API_KEY` are set (preferred), otherwise jfa-go. With no backend configured the check returns `{ exists: false, verified: false }` and the UI shows a neutral "could not be verified" hint instead of a false positive.
- Subscription time is credited via jfa-go: the API logs in with `JFA_GO_USER`/`JFA_GO_PASSWORD` (jfa-go issues short-lived tokens, no static key) and sets the account expiry through `POST /users/extend`.
