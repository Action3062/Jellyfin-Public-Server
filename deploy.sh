#!/usr/bin/env bash
# Byteflix deployment: builds and starts the full stack via Docker Compose,
# applies pending database migrations, and verifies health endpoints.
# Requirements on the target server: Docker Engine with the compose v2 plugin.
set -euo pipefail
cd "$(dirname "$0")/infra"

if ! command -v docker >/dev/null 2>&1; then
  echo "FEHLER: docker ist nicht installiert." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "FEHLER: das Docker-Compose-v2-Plugin fehlt (Befehl: docker compose)." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "infra/.env wurde aus .env.example erstellt."
  echo "Bitte Secrets eintragen (mindestens POSTGRES_PASSWORD; für Livebetrieb"
  echo "NOWPayments-Keys, jfa-go-Zugangsdaten, PUBLIC_BASE_URL) und deploy.sh erneut ausführen."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./.env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "FEHLER: POSTGRES_PASSWORD ist in infra/.env nicht gesetzt." >&2
  exit 1
fi
if [ -n "${NOWPAYMENTS_API_KEY:-}" ] && [ -z "${NOWPAYMENTS_IPN_SECRET:-}" ]; then
  echo "WARNUNG: NOWPAYMENTS_API_KEY ohne NOWPAYMENTS_IPN_SECRET gesetzt —" >&2
  echo "         die API verweigert so den Produktionsstart (Schutz vor gefälschten Webhooks)." >&2
fi

compose() { docker compose --env-file .env -f docker-compose.yml "$@"; }

echo "==> Images bauen"
compose build

echo "==> Datastores starten (postgres, redis, jfa-go)"
compose up -d postgres redis jfa-go

echo "==> Warte auf Postgres"
ready=0
for _ in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U portal -d payment_portal >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "FEHLER: Postgres wurde nicht rechtzeitig bereit. Logs: docker compose -f infra/docker-compose.yml logs postgres" >&2
  exit 1
fi

echo "==> Datenbank-Migrationen anwenden"
compose run --rm --no-deps api npx prisma migrate deploy --schema api/prisma/schema.prisma

echo "==> API und Web starten"
compose up -d api web

echo "==> Healthchecks"
sleep 5
curl -fsS http://localhost:4000/health && echo
curl -fsS -o /dev/null -w "web: HTTP %{http_code}\n" http://localhost:3000/

cat <<'DONE'

Deployment abgeschlossen.

Nächste Schritte (einmalig):
  1. jfa-go einrichten: http://127.0.0.1:8056 (Setup-Wizard, mit Jellyfin verbinden,
     Profil anlegen) — danach JFA_GO_USERNAME/JFA_GO_PASSWORD/JFA_GO_DEFAULT_PROFILE
     in infra/.env eintragen und `./deploy.sh` erneut ausführen.
  2. Reverse Proxy/TLS auf Port 3000 (Web) legen, z. B. byteflix.org;
     PUBLIC_BASE_URL und API_PUBLIC_BASE_URL in infra/.env entsprechend setzen.
     Der NOWPayments-Webhook erreicht die API unter /api/webhooks/nowpayments (Port 4000).
  3. JELLYFIN_PUBLIC_URL setzen, damit Neukunden nach der Registrierung den
     "Jetzt anmelden"-Button sehen.

Logs:   docker compose -f infra/docker-compose.yml logs -f
Stopp:  docker compose -f infra/docker-compose.yml down
DONE
