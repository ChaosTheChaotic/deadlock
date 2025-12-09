#!/usr/bin/env bash

function fatal() {
  local msg=$1

  printf "[FATAL]: %s" "$msg"
  exit 1
}

function check_installed() {
  local cmd=$1

  if ! command -v "$cmd" >/dev/null 2>&1; then
    fatal "$cmd not installed, please install it"
  fi
}
