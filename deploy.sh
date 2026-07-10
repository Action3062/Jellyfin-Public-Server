#!/usr/bin/env bash
# Byteflix deployment: builds and starts the compose stack (web, api,
# postgres, redis), syncs the database schema, and verifies health endpoints.
#
#   ./deploy.sh            # pull latest, build, sync DB schema, restart
#   ./deploy.sh --no-pull  # deploy the currently checked-out state
#
# jfa-go and the Discord bot run as separate containers and are NOT touched.
# (No existing jfa-go? Start the bundled one: cd infra && docker compose --profile bundled-jfa up -d jfa-go)
set -euo pipefail
cd "$(dirname "$0")"

# docker compose v2 (plugin) with a docker-compose v1 fallback.
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose --env-file infra/.env -f infra/docker-compose.yml "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose --env-file infra/.env -f infra/docker-compose.yml "$@"; }
else
  echo "FEHLER: weder 'docker compose' noch 'docker-compose' gefunden." >&2
  exit 1
fi

if [ ! -f infra/.env ]; then
  cp infra/.env.example infra/.env
  echo "infra/.env wurde aus .env.example erstellt."
  echo "Bitte Secrets eintragen (mindestens POSTGRES_PASSWORD; für Livebetrieb NOWPayments-,"
  echo "jfa-go- und ADMIN_*-Werte) und deploy.sh erneut ausführen."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source ./infra/.env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "FEHLER: POSTGRES_PASSWORD ist in infra/.env nicht gesetzt." >&2
  echo "Hinweis: Ein bestehendes Postgres-Volume behält das Passwort seiner ersten" >&2
  echo "Initialisierung — dort den tatsächlich vergebenen Wert eintragen." >&2
  exit 1
fi
if [ -n "${NOWPAYMENTS_API_KEY:-}" ] && [ -z "${NOWPAYMENTS_IPN_SECRET:-}" ]; then
  echo "WARNUNG: NOWPAYMENTS_API_KEY ohne NOWPAYMENTS_IPN_SECRET gesetzt —" >&2
  echo "         die API verweigert so den Produktionsstart (Schutz vor gefälschten Webhooks)." >&2
fi

if [ "${1:-}" != "--no-pull" ]; then
  echo "==> Aktualisiere Repository (git pull --ff-only)"
  git pull --ff-only
fi

echo "==> Baue Images"
compose build

echo "==> Starte Datastores (postgres, redis)"
compose up -d postgres redis

echo "==> Warte auf Postgres"
ready=0
for _ in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U postgres -d payment_portal >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "FEHLER: Postgres wurde nicht rechtzeitig bereit. Logs: docker compose -f infra/docker-compose.yml logs postgres" >&2
  exit 1
fi

echo "==> Synchronisiere Datenbankschema (prisma db push)"
# db push is additive-safe and works on databases without a migration history
# (the production DB predates the committed migrations). It refuses
# destructive changes unless forced.
if ! compose run --rm --no-deps api npx prisma db push --schema api/prisma/schema.prisma --skip-generate; then
  cat >&2 <<'HINT'

FEHLER: Schema-Sync fehlgeschlagen.
Häufigste Ursache bei "P1000 Authentication failed": Das Postgres-Volume behält
das Passwort seiner ERSTEN Initialisierung — POSTGRES_PASSWORD in infra/.env
wirkt nur auf ein leeres Volume. Optionen:
  a) Daten behalten — Passwort im Container auf den .env-Wert setzen:
     docker compose -f infra/docker-compose.yml exec postgres \
       psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<WERT AUS .env>';"
  b) Frische Datenbank (ALLE DATEN WEG):
     docker compose -f infra/docker-compose.yml down -v && ./deploy.sh
HINT
  exit 1
fi

echo "==> Starte API und Web"
compose up -d api web

echo "==> Healthchecks"
sleep 5
curl -fsS "http://localhost:4000/health" && echo
curl -fsS -o /dev/null -w "web: HTTP %{http_code}\n" "http://localhost:3000/"

cat <<'DONE'

Deployment abgeschlossen.

Checkliste:
  - jfa-go läuft extern und ist via JFA_GO_BASE_URL (z. B. http://host.docker.internal:8056)
    erreichbar; JFA_GO_USER(NAME)/JFA_GO_PASSWORD in infra/.env gesetzt.
  - /admin erreichbar? ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_SESSION_SECRET setzen,
    danach im Panel 2FA aktivieren.
  - Discord-Bot: BOT_API_SECRET in infra/.env und beim Bot identisch konfigurieren.
  - Reverse Proxy/TLS auf Port 3000 (Web) und 4000 (API-Webhooks) legen;
    BIND_HOST=127.0.0.1 setzen, sobald der Proxy steht.

Logs:   docker compose -f infra/docker-compose.yml logs -f
Stopp:  docker compose -f infra/docker-compose.yml down
DONE
