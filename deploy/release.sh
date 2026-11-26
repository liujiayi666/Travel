#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(dirname "$script_dir")"

cd "$repository_root"

if [[ ! -f .env ]]; then
  echo "Missing $repository_root/.env." >&2
  exit 1
fi

read_env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1
}

api_image="$(read_env_value TRAVEL_API_IMAGE)"
edge_image="$(read_env_value TRAVEL_EDGE_IMAGE)"
postgres_db="$(read_env_value POSTGRES_DB)"
postgres_user="$(read_env_value POSTGRES_USER)"

is_immutable_image() {
  [[ "$1" == *@sha256:* || "$1" =~ ^ghcr\.io/.+:sha-[0-9a-f]{40}$ ]]
}

if ! is_immutable_image "$api_image" || ! is_immutable_image "$edge_image"; then
  echo "TRAVEL_API_IMAGE and TRAVEL_EDGE_IMAGE must use immutable SHA tags or digests." >&2
  exit 1
fi

compose=(
  docker compose
  --env-file "$repository_root/.env"
  -f "$repository_root/deploy/compose.yml"
)

"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait db

backup_dir="$repository_root/backups"
backup_file="$backup_dir/${postgres_db}-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$backup_dir"

echo "Creating database backup: $backup_file"
"${compose[@]}" exec -T db \
  pg_dump -U "$postgres_user" -d "$postgres_db" -Fc > "$backup_file"

echo "Pulling pinned images"
"${compose[@]}" pull api edge

echo "Applying database migrations"
"${compose[@]}" run --rm migrate

echo "Starting API and edge"
"${compose[@]}" up -d --no-build --wait --wait-timeout 120 api edge

"${compose[@]}" ps
