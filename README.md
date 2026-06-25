# Payment Portal

Privacy-focused Jellyfin/Plex subscription payment portal with a Next.js frontend and a Node.js companion backend.

## Stack

- Frontend: Next.js App Router, TypeScript, Tailwind-compatible design tokens, Inter via `next/font`
- Backend: Fastify, TypeScript, Prisma/PostgreSQL, BullMQ/Redis
- Payments: NowPayments invoices/IPN, Azteco adapter with mock and real-client TODO boundary
- Provisioning: jfa-go/Jellyfin expiry adapter, Plex invite adapter
- Deployment: Docker Compose for web, api, postgres, redis, jfa-go

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
4. Start Postgres/Redis using `docker compose -f infra/docker-compose.yml up postgres redis jfa-go`.
5. Run migrations/seeds, then start dev services:

```bash
npm --workspace api run prisma:migrate
npm run dev
```

## API Contract

- `GET /pay/api/products`
- `GET /pay/api/azteco/options`
- `POST /pay/api/user/check`
- `POST /pay/api/nowpayments/create`
- `GET /pay/api/nowpayments/status/:invoice_id`
- `POST /pay/api/azteco/redeem`
- `POST /pay/api/plex/invite`

Legacy field note: `discord_user` carries the Jellyfin username by design.

## Sandbox Notes

- Leave `NOWPAYMENTS_API_KEY` empty for mock invoice URLs, or set `NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1` with a sandbox key.
- Keep `AZTECO_CLIENT_MODE=mock` until the reseller API spec is available.
- User checks query the Jellyfin API when `JELLYFIN_BASE_URL` and `JELLYFIN_API_KEY` are set (preferred), otherwise jfa-go. With no backend configured the check returns `{ exists: false, verified: false }` and the UI shows a neutral "could not be verified" hint instead of a false positive.
- Subscription time is credited via jfa-go: the API logs in with `JFA_GO_USER`/`JFA_GO_PASSWORD` (jfa-go issues short-lived tokens, no static key) and sets the account expiry through `POST /users/extend`.
