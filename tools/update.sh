#!/usr/bin/env bash

ABP=$(dirname $(realpath "$0"))
PR="$(dirname -- "$ABP")"

# Include utility functions
source $ABP/utils.sh

# Check setup
check_common_deps

function update_dir() {
  local dir=$1
  local rust=$2

  local cmd

  [[ "$rust" == "true" ]] && cmd="cargo update" || cmd="pnpm update"

  cd $dir && $cmd && echo "Updated $dir" || fatal "Failed to update $dir"
}

update_dir "$PR/web" "false"
update_dir "$PR/serv" "false"

CRATES="${PR%/}/serv/src/crates"
update_dir "$CRATES/napi_exports" "false"
update_dir "$CRATES" "true"
