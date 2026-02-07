#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))
PR="$(dirname -- "$ABP")"

regen=false

parse_opts() {
  local OPTIND OPTARG opt

  while getopts "r" opt; do
    case "$opt" in
      r)
	regen=true
	;;
    esac
  done
}

# Include utility functions
source $ABP/utils.sh

# Check setup
check_common_deps

parse_opts "$@"

if [ ! -d "$PR/web/node_modules" ] || [ ! -d "$PR/serv/node_modules" ] || [ ! -d "$PR/serv/src/crates/napi_exports/node_modules" ]; then
    read -p "Setup is not complete, would you like to setup through the script? (Y/n): " yn
    yn=${yn:-y}
    case "$yn" in
      [Yy]* ) "$ABP/setup.sh" || fatal "Setup failed";;
      [Nn]* ) fatal "Not running setup script, aborting";;
      * ) fatal "Invalid case hit";;
    esac
fi

# Check for running postgres
psq=$(check_running_postgres)

if [ "$psq" == "0" ]; then
  echo "A running postgres was found!"
elif [ "$psq" == "1" ]; then
  echo "No running postgres was found, the program WILL error in console."
  echo "If you are using docker ensure docker-compose up -d was run and a docker session is running"
  echo "If you are using raw postgres ensure it is running"
else
  echo "Invalid state"
fi

rds=$(check_running_redis)

if [ "$rds" == "0" ]; then
  echo "A running redis was found!"
elif [ "$rds" == "1" ]; then
  echo "No running redis was found, the program WILL error in console."
  echo "If you are using docker ensure docker-compose up -d was run and a docker session is running"
  echo "If you are using raw redis ensure it is running"
else
  echo "Invalid state"
fi

if "$regen"; then
  echo "Trying to generate secure prod keys"
  source $ABP/gen.sh
else
  echo "Not generating secure prod keys."
fi

if grep -q "replace_me" "$PR/.env.prod"; then
  source $PR/.env.prod
else
  echo "OAuth will NOT work, oauth creds are invalid"
  echo "Create:"
  echo "GOOGLE_CLIENT_ID=your_google_client_id_here_replace_me"
  echo "GOOGLE_CLIENT_SECRET=your_google_client_secret_here_replace_me"
  echo "Inside a file named .env.prod in the project root to allow oauth to work"
fi

# Build everything and run
cd $PR/web
pnpm build && echo "Sucessfully built the web" || fatal "Failed to build web"

cd $PR/serv/src/crates/napi_exports && pnpm build && echo "Built the napi rust exports" || fatal "Failed to build napi rust exports"

cd $PR/serv
pnpm build && echo "Successfully built server" || fatal "Failed to build server"
pnpm start:prod
