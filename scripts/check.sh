#!/bin/sh
set -eu

mode="${1:-full}"

case "$mode" in
  quick|full) ;;
  *)
    echo "Usage: $0 [quick|full]" >&2
    exit 2
    ;;
esac

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

section() {
  printf '\n==> %s\n' "$1"
}

section "Git whitespace checks"
git diff --check
git diff --cached --check

section "Backend formatting and lint"
(
  cd backend
  uv run --frozen ruff format --check .
  uv run --frozen ruff check .
)

section "Frontend lint and unit tests"
(
  cd frontend
  npm run lint
  npm test
)

section "Frontend production build"
(
  cd frontend
  npm run build
)

if [ "$mode" = "full" ]; then
  section "Backend tests"
  if ! docker compose exec -T db pg_isready -U travel -d travel >/dev/null 2>&1; then
    echo "PostgreSQL is not ready. Start it with: docker compose up -d db" >&2
    exit 1
  fi

  if ! docker compose exec -T db \
    psql -U travel -d travel -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'travel_test'" |
    grep -q 1; then
    docker compose exec -T db createdb -U travel travel_test
  fi

  test_database_url="${TEST_DATABASE_URL:-postgresql+psycopg_async://travel:travel@localhost:5432/travel_test}"

  (
    cd backend
    DATABASE_URL="$test_database_url" APP_ENV=test \
      uv run --frozen alembic upgrade head
    DATABASE_URL="$test_database_url" APP_ENV=test \
      uv run --frozen pytest
  )
fi
