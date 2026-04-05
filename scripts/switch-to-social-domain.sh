#!/usr/bin/env bash
set -euo pipefail

# Switch SCP redirect URIs from one domain to another
# Run this AFTER updating your reverse proxy to point the new domain at SCP

ENV_FILE="${SCP_ENV_FILE:-/opt/scp/.env}"
OLD_DOMAIN="${1:?Usage: $0 <old-domain> <new-domain>}"
NEW_DOMAIN="${2:?Usage: $0 <old-domain> <new-domain>}"

echo "Switching SCP redirect URIs: $OLD_DOMAIN → $NEW_DOMAIN"

sed -i "s|$OLD_DOMAIN|$NEW_DOMAIN|g" "$ENV_FILE"
grep "REDIRECT_URI" "$ENV_FILE"

echo ""
echo "Restarting SCP services..."
pm2 restart scp-api scp-worker

echo ""
echo "Done. Verify at https://$NEW_DOMAIN"
echo ""
echo "Remaining manual steps:"
echo "  1. Update each provider's OAuth redirect URL in their developer portal"
echo "  2. Remove old $OLD_DOMAIN proxy host from NPM"
echo "  3. Optionally keep $OLD_DOMAIN as a redirect to $NEW_DOMAIN"
