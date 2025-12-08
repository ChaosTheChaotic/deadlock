#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

check_installed "pnpm"
check_installed "cargo"
check_installed "rustc"
