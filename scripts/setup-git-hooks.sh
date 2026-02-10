#!/bin/sh
set -eu

repo_root=$(git rev-parse --show-toplevel)
hooks_path="$repo_root/.githooks"

if [ ! -f "$hooks_path/pre-push" ]; then
	echo "Missing hook file: $hooks_path/pre-push"
	exit 1
fi

chmod +x "$hooks_path/pre-push"
git config core.hooksPath "$hooks_path"

echo "Git hooks installed."
echo "core.hooksPath=$hooks_path"
