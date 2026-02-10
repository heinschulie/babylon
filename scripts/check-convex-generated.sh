#!/bin/sh
set -eu

if ! CI=1 bunx convex codegen >/dev/null; then
	echo "Convex codegen failed."
	echo "Ensure Convex CLI can reach your deployment and is authenticated for this environment."
	exit 1
fi

if [ -n "$(git status --porcelain -- convex/_generated)" ]; then
	echo "convex/_generated is out of date."
	echo "Run 'bun run convex:codegen' and commit the resulting changes."
	git status --short -- convex/_generated
	exit 1
fi

echo "convex/_generated is up to date."
