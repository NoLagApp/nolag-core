#!/usr/bin/env sh
#
# Create and migrate the database the e2e suites run against.
#
#   ./scripts/test-db.sh
#
# Separate from the quickstart's database so a test run cannot disturb data you
# are looking at, and recreated from nothing so `docker compose down -v` does
# not leave the suites failing with a confusing "database does not exist".

set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f "$ROOT/.env" ]; then
  echo "No .env. Run ./quickstart/quickstart.sh first." >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$ROOT/.env"

DB=${TEST_POSTGRES_DATABASE:-nolag_core_test}
PORT=${POSTGRES_PORT:-5442}

echo "Creating $DB if absent"
docker compose exec -T postgres \
  psql -U nolag -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 \
  || docker compose exec -T postgres psql -U nolag -d postgres -c "CREATE DATABASE \"$DB\""

echo "Migrating $DB"
POSTGRES_HOST=localhost \
POSTGRES_PORT="$PORT" \
POSTGRES_USER=nolag \
POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
POSTGRES_DATABASE="$DB" \
  npx typeorm-ts-node-commonjs migration:run -d tools/data-source.ts >/dev/null

echo "Ready. Run the suites with:"
echo "  POSTGRES_HOST=localhost POSTGRES_PORT=$PORT POSTGRES_USER=nolag \\"
echo "    POSTGRES_PASSWORD=\"\$POSTGRES_PASSWORD\" npm run test:e2e"
