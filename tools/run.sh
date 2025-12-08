#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

check_installed "pnpm"

PR="$(dirname -- "$ABP")"

cd $PR/web
pnpm build && echo "Sucessfully built the web" || fatal "Failed to build web"

CRATES="${PR%/}/serv/src/crates"

for dir in "$CRATES"/*/; do
  dirn="${dir%/}"
  (cd "$dirn" && pnpm build && echo "Built $dirn" || echo "Failed to build $dirn")
done

cd $PR/serv
pnpm build && echo "Successfully built server" || fatal "Failed to build server"
pnpm start:prod
