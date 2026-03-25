#!/usr/bin/env bash
# Setup Cloudflare Tunnel DNS routes and Vite allowedHosts for all apps.
# Reads tunnel.config.json as the single source of truth.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$REPO_ROOT/tunnel.config.json"

if ! command -v cloudflared &>/dev/null; then
	echo "❌ cloudflared not installed. Run: brew install cloudflared"
	exit 1
fi

if ! command -v jq &>/dev/null; then
	echo "❌ jq not installed. Run: brew install jq"
	exit 1
fi

TUNNEL_NAME=$(jq -r '.tunnel' "$CONFIG")
DOMAIN=$(jq -r '.domain' "$CONFIG")

# Check cloudflared auth
if ! cloudflared tunnel list &>/dev/null; then
	echo "❌ cloudflared not authenticated. Run: cloudflared login"
	exit 1
fi

# Check tunnel exists
if ! cloudflared tunnel list --name "$TUNNEL_NAME" 2>/dev/null | grep -q "$TUNNEL_NAME"; then
	echo "❌ Tunnel '$TUNNEL_NAME' not found. Create it with: cloudflared tunnel create $TUNNEL_NAME"
	exit 1
fi

echo "✅ Tunnel '$TUNNEL_NAME' exists"

# Collect all subdomains (apps + services)
ALL_SUBDOMAINS=$(jq -r '
  ([.apps | to_entries[] | "\(.value.subdomain)"] +
   [.services | to_entries[] | "\(.value.subdomain)"])[]
' "$CONFIG")

# Ensure DNS routes exist for all subdomains
for SUB in $ALL_SUBDOMAINS; do
	HOSTNAME="${SUB}.${DOMAIN}"
	# Check if CNAME already exists by querying tunnel info
	if cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 | grep -q "already exists"; then
		echo "✅ DNS route: $HOSTNAME (exists)"
	else
		echo "✅ DNS route: $HOSTNAME (created)"
	fi
done

# Build and write ~/.cloudflared/config.yml
CREDS_FILE=$(ls ~/.cloudflared/*.json 2>/dev/null | grep -v cert.pem | head -1)
if [ -z "$CREDS_FILE" ]; then
	echo "❌ No tunnel credentials file found in ~/.cloudflared/"
	exit 1
fi

CONFIG_YML="$HOME/.cloudflared/config.yml"
{
	echo "tunnel: $TUNNEL_NAME"
	echo "credentials-file: $CREDS_FILE"
	echo ""
	echo "ingress:"

	# Apps
	jq -r '.domain as $d | .apps | to_entries[] | "  - hostname: \(.value.subdomain).\($d)\n    service: http://localhost:\(.value.port)"' "$CONFIG"

	# Services
	jq -r '.domain as $d | .services | to_entries[] | "  - hostname: \(.value.subdomain).\($d)\n    service: http://localhost:\(.value.port)"' "$CONFIG"

	echo "  - service: http_status:404"
} > "$CONFIG_YML"

echo "✅ Wrote $CONFIG_YML"

# Ensure Vite allowedHosts for each app with a vite.config.ts
jq -r '.domain as $d | .apps | to_entries[] | "\(.key) \(.value.subdomain).\($d)"' "$CONFIG" | while read -r APP_NAME HOSTNAME; do
	VITE_CONFIG="$REPO_ROOT/apps/$APP_NAME/vite.config.ts"

	if [ ! -f "$VITE_CONFIG" ]; then
		echo "⏭️  No vite.config.ts for $APP_NAME, skipping allowedHosts"
		continue
	fi

	if grep -q "allowedHosts" "$VITE_CONFIG"; then
		# Check if this specific hostname is already listed
		if grep -q "$HOSTNAME" "$VITE_CONFIG"; then
			echo "✅ Vite allowedHosts: $APP_NAME → $HOSTNAME (exists)"
		else
			# Append to existing allowedHosts array
			sed -i '' "s/allowedHosts: \[/allowedHosts: ['$HOSTNAME', /" "$VITE_CONFIG"
			echo "✅ Vite allowedHosts: $APP_NAME → $HOSTNAME (added)"
		fi
	else
		# Add allowedHosts to server block
		if grep -q "server:" "$VITE_CONFIG"; then
			sed -i '' "/server: {/a\\
\\		allowedHosts: ['$HOSTNAME'],
" "$VITE_CONFIG"
			echo "✅ Vite allowedHosts: $APP_NAME → $HOSTNAME (created)"
		else
			echo "⚠️  No server block in $VITE_CONFIG — add allowedHosts manually"
		fi
	fi
done

echo ""
echo "Done. Run 'just tunnel' or 'just dev' to start."
