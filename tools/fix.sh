#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

check_installed "pnpm"

PR="$(dirname -- "$ABP")"

cd $PR/web
pnpm fix && echo "Fixed web" || fatal "Failed to fix web"

cd $PR/serv
pnpm fix && echo "Fixed server" || fatal "Failed to fix server"
