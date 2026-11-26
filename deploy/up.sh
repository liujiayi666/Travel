#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(dirname "$script_dir")"

cd "$repository_root"

if [[ ! -f .env ]]; then
  echo "Missing $repository_root/.env. Copy a deploy/env/*.env.example file first." >&2
  exit 1
fi

compose=(
  docker compose
  --env-file "$repository_root/.env"
  -f "$repository_root/deploy/compose.yml"
)

"${compose[@]}" config --quiet
"${compose[@]}" up -d db
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d api
"${compose[@]}" up -d --build edge
"${compose[@]}" ps
