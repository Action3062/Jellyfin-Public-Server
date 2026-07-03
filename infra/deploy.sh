#!/usr/bin/env bash
# Deploys the payment portal stack (web, api, postgres, redis) on this host.
#
#   ./infra/deploy.sh            # pull latest, build, sync DB schema, restart
#   ./infra/deploy.sh --no-pull  # deploy the currently checked-out state
#
# Requirements: docker with the compose plugin (or docker-compose), and a
# filled-in infra/.env (copy from .env.example). jfa-go and the Discord bot
# run as separate containers and are NOT touched by this script.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "FEHLER: infra/.env fehlt — 'cp infra/.env.example infra/.env' und Secrets eintragen." >&2
  exit 1
fi

# docker compose v2 (plugin) with a docker-compose v1 fallback.
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "FEHLER: weder 'docker compose' noch 'docker-compose' gefunden." >&2
  exit 1
fi

if [ "${1:-}" != "--no-pull" ]; then
  echo "==> Aktualisiere Repository (git pull --ff-only)"
  git -C .. pull --ff-only
fi

echo "==> Baue Images"
compose build

echo "==> Starte Postgres/Redis"
compose up -d postgres redis

echo "==> Synchronisiere Datenbankschema (prisma db push)"
# Runs inside the api image so the container's DATABASE_URL (compose postgres)
# is used. db push is additive-safe; it refuses destructive changes unless
# forced, which fits this repo (no committed migration history).
if ! compose run --rm api npm --workspace api run prisma:push; then
  cat >&2 <<'HINT'

FEHLER: Schema-Sync fehlgeschlagen.
Häufigste Ursache bei "P1000 Authentication failed": Das Postgres-Volume behält
das Passwort seiner ERSTEN Initialisierung — POSTGRES_PASSWORD in infra/.env
wirkt nur auf ein leeres Volume. Optionen:
  a) Daten behalten — Passwort im Container auf den .env-Wert setzen:
     docker compose -f infra/docker-compose.yml exec postgres \
       psql -U postgres -c "ALTER USER postgres WITH PASSWORD '<WERT_AUS_ENV>';"
  b) Frische Installation (LÖSCHT ALLE DATEN):
     docker compose -f infra/docker-compose.yml down && docker volume rm infra_postgres_data
Danach dieses Script erneut ausführen.
HINT
  exit 1
fi

echo "==> Starte Stack"
compose up -d

echo "==> Warte auf API-Health"
api_ok=""
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then api_ok=1; break; fi
  sleep 2
done
if [ -n "$api_ok" ]; then
  echo "    API ist erreichbar (http://127.0.0.1:4000/health)."
else
  echo "    WARNUNG: API antwortet nicht auf /health — Logs prüfen: 'docker compose -f infra/docker-compose.yml logs api'" >&2
fi

web_ok=""
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then web_ok=1; break; fi
  sleep 2
done
if [ -n "$web_ok" ]; then
  echo "    Web ist erreichbar (http://127.0.0.1:3000)."
else
  echo "    WARNUNG: Web antwortet nicht — Logs prüfen: 'docker compose -f infra/docker-compose.yml logs web'" >&2
fi

echo "==> Status"
compose ps

echo "Fertig. Logs verfolgen mit: docker compose -f infra/docker-compose.yml logs -f"
