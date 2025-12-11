#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))
PR="$(dirname -- "$ABP")"

source $ABP/utils.sh

check_common_deps

cd $ABP/../web && pnpm i || fatal "Failed to install dependencies for website"
echo "Installed deps for the website successfully"

cd $ABP/../serv && pnpm i || fatal "Failed to install dependencies for the server"

CRATES="${PR%/}/serv/src/crates"

for dir in "$CRATES"/*/; do
  dirn="${dir%/}"
  (cd "$dirn" && pnpm i || fatal "Failed to install deps for rust module: $dirn")
done

echo "Successfully installed all deps for server"

echo "Setup complete!"
echo "Note that although the main setup is complete, a postgresql server is needed"
echo "You may do this via docker (using the docker-compose.yml provided) or via an actual installation"
