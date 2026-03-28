#!/usr/bin/env bash
set -euo pipefail

# Switch SCP from social-plane.teamlewis.co to social.teamlewis.co
# Run this AFTER updating Nginx Proxy Manager to point social.teamlewis.co at SCP

ENV_FILE="/opt/scp/.env"
OLD_DOMAIN="social-plane.teamlewis.co"
NEW_DOMAIN="social.teamlewis.co"

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
echo "  2. Remove old social-plane.teamlewis.co proxy host from NPM"
echo "  3. Optionally keep social-plane.teamlewis.co as a redirect to social.teamlewis.co"
