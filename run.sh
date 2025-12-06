#!/usr/bin/env bash

fatal() {
  local msg=$1

  printf "[FATAL]: %s" "$msg"
  exit 1
}

check_installed() {
  local cmd=$1

  if ! command -v "$cmd" >/dev/null 2>&1; then
    fatal "$cmd not installed, please install it"
  fi
}

check_installed "pnpm"

ABP=$(dirname $(realpath "$0"))

cd $ABP/web
pnpm build && echo "Sucessfully built the web" || fatal "Failed to build web"

cd $ABP/serv
pnpm build && echo "Successfully built server" || fatal "Failed to build server"
pnpm start:prod
