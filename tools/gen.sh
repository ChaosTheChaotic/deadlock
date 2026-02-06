#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

echo "Trying to generate secure keys for prod"
check_installed_warn "openssl" "Cannot generate secure keys for .env; using defaults"

export JWT_ACCESS_SECRET="$(openssl rand -base64 32)"
export JWT_REFRESH_SECRET="$(openssl rand -base64 32)"
export COOKIE_SECRET="$(openssl rand -base64 32)"
