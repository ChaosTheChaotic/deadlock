#!/usr/bin/env bash

if [ -n "${__UTILS_SH_SOURCED:-}" ]; then
  return 0
fi
__UTILS_SH_SOURCED=1

function fatal() {
  local msg=$1

  printf "[FATAL]: %s" "$msg"
  exit 1
}

function warn() {
  local msg=$1

  printf "[WARN]: %s" "$msg"
}

function check_installed_internal() {
  local cmd=$1
  local not=$2

  if ! command -v "$cmd" >/dev/null 2>&1; then
    "$not"
  fi
}

function check_installed() {
  check_installed_internal "$1" "fatal \"$cmd not installed, please install it\""
}

function check_installed_warn() {
  check_installed_internal "$1" "warn \"$cmd not installed, some functions might not work correctly without it: $2\""
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
      [Yy]* ) echo "Installing..." && eval "$icmd";;
      [Nn]* ) fatal "$cmd not installed, which is needed to run this";;
      * ) fatal "Invalid case hit";;
    esac
  fi
}

function check_common_deps() {
  check_installed_prompt "pnpm" "curl -fsSL https://get.pnpm.io/install.sh | sh -"
  check_installed_prompt "cargo" "curl https://sh.rustup.rs -sSf | sh "
}

function check_running_postgres() {
  if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
    echo "0"
  elif command -v docker &> /dev/null; then
    if docker ps -q | xargs -I {} docker inspect -f '{{.Config.Env}}' {} 2>/dev/null | grep POSTGRES_ >/dev/null 2>&1; then
      echo "0"
    else
      echo "1"
    fi
  else
    echo "1"
  fi
}

function check_running_redis() {
  local redis_host=${REDIS_HOST:-localhost}
  local redis_port=${REDIS_PORT:-6379}
  
  if command -v redis-cli &> /dev/null; then
    if redis-cli -h "$redis_host" -p "$redis_port" ping &> /dev/null; then
      echo "0"
      return
    fi
  fi
  
  if command -v docker &> /dev/null; then
    if docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | \
       grep -E '(redis|redis-server|redis:)' &> /dev/null; then
      echo "0"
      return
    fi
  fi
  
  echo "1"
}
