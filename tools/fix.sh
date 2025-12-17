#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))

source $ABP/utils.sh

check_common_deps
check_installed "rustfmt"

PR="$(dirname -- "$ABP")"

cd $PR/web
pnpm fix && echo "Fixed web" || fatal "Failed to fix web"

cd $PR/serv
pnpm fix && echo "Fixed server" || fatal "Failed to fix server"

cd $PR/serv/src/crates
cargo clippy --fix && echo "Fixed Rust" || fatal "Failed to fix rust"
