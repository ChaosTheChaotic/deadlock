#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))
PR="$(dirname -- "$ABP")"

source $ABP/utils.sh

if [ ! -d "$PR/web/node_modules" ] || [ ! -d "$PR/serv/node_modules" ] || [! -d "$PR/serv/src/crates/db/node_modules"]; then
    read -p "Setup is not complete, would you like to setup through the script? (Y/n): " yn
    yn=${yn:-y}
    case "$yn" in
      [Yy]* ) "$ABP/setup.sh" || fatal "Setup failed";;
      [Nn]* ) fatal "Not running setup script, aborting";;
      * ) fatal "Invalid case hit";;
    esac
fi

check_installed "pnpm"

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
