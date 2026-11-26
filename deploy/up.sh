#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(dirname "$script_dir")"

cd "$repository_root"

if [[ ! -f .env ]]; then
  echo "Missing $repository_root/.env. Copy a deploy/env/*.env.example file first." >&2
  exit 1
fi

read_env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1
}

deploy_env="$(read_env_value DEPLOY_ENV)"
api_image="$(read_env_value TRAVEL_API_IMAGE)"
edge_image="$(read_env_value TRAVEL_EDGE_IMAGE)"

if [[ "$deploy_env" != "dev" || "$api_image" == ghcr.io/* || "$edge_image" == ghcr.io/* ]]; then
  echo "deploy/up.sh only builds and starts the local dev stack." >&2
  echo "Server deployments must pull pinned images without building them." >&2
  exit 1
fi

compose=(
  docker compose
  --env-file "$repository_root/.env"
  -f "$repository_root/deploy/compose.yml"
)

"${compose[@]}" config --quiet

docker build --tag "${api_image:-travel-api:dev}" "$repository_root/backend"
docker build \
  --file "$repository_root/deploy/frontend.Dockerfile" \
  --tag "${edge_image:-travel-edge:dev}" \
  "$repository_root"

"${compose[@]}" up -d db
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d api
"${compose[@]}" up -d edge
"${compose[@]}" ps
