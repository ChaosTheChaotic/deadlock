#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

check_installed_prompt "pnpm" "curl -fsSL https://get.pnpm.io/install.sh | sh -"
check_installed_prompt "cargo" "curl https://sh.rustup.rs -sSf | sh"

cd $ABP/../web && pnpm i || fatal "Failed to install dependencies for website"
echo "Installed deps for the website successfully"

cd $ABP/../serv && pnpm i || fatal "Failed to install dependencies for the server"
cd $ABP/../serv/src/crates/db && pnpm i || fatal "Failed to install dependencies for database rust module"
echo "Successfully installed all deps for server"
