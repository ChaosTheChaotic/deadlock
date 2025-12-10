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

function check_installed_prompt() {
  local cmd=$1
  local icmd=$2

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "The following is only designed for linux machines, select no and install manually if not on linux"
    echo "If yes is selected the following command will be run:"
    echo "$icmd"
    read -p "$cmd is not installed, would you like to install it through the script using the above command? (y/N): " yn
    yn=${yn:-n}
    case "$yn" in
      [Yy]* ) echo "Installing..." && icmd;;
      [Nn]* ) fatal "$cmd not installed, which is needed to run this";;
      * ) fatal "Invalid case hit";;
    esac
  fi
}

function check_common_deps() {
  check_installed_prompt "pnpm" "curl -fsSL https://get.pnpm.io/install.sh | sh -"
  check_installed_prompt "cargo" "curl https://sh.rustup.rs -sSf | sh"
}
