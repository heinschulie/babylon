#!/bin/sh
set -eu

output="$(bun install --frozen-lockfile 2>&1)" || {
	echo "$output"
	echo ""
	if printf '%s' "$output" | grep -q "lockfile had changes"; then
		echo "bun.lock is out of sync with package manifests."
		echo "Run 'bun install' and commit /Users/heinschulie/Documents/code/babylon/bun.lock."
	else
		echo "Lockfile check failed for a non-lockfile reason."
		echo "Resolve the Bun error above and retry."
	fi
	exit 1
}

echo "$output" | tail -n 1
echo "bun.lock is in sync."
