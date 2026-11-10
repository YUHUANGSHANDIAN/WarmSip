#!/usr/bin/env bash
set -euo pipefail

deb="${1:?usage: linux-smoke.sh path/to/package.deb}"
app_user="${2:-${SUDO_USER:-root}}"
test "$(id -u)" = "0"

dpkg -i "$deb"
set +e
runuser -u "$app_user" -- \
  xvfb-run -a timeout 12s warmsip >/tmp/warmsip-linux-smoke.log 2>&1
status=$?
set -e
cat /tmp/warmsip-linux-smoke.log
test "$status" = "124"
printf 'Linux package installed and process remained alive for 12 seconds.\n'
