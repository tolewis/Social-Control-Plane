#!/usr/bin/env bash
set -euo pipefail

# Download Inter font files for Satori rendering.
# Run once after cloning: bash packages/visual-engine/scripts/setup-fonts.sh

ASSETS_DIR="$(dirname "$0")/../assets"
mkdir -p "$ASSETS_DIR"

INTER_VERSION="4.1"
ZIP_URL="https://github.com/rsms/inter/releases/download/v${INTER_VERSION}/Inter-${INTER_VERSION}.zip"
TMP_ZIP="$(mktemp)"

echo "Downloading Inter v${INTER_VERSION}..."
curl -sL "$ZIP_URL" -o "$TMP_ZIP"

echo "Extracting TTF files..."
unzip -oj "$TMP_ZIP" \
  "extras/ttf/Inter-Regular.ttf" \
  "extras/ttf/Inter-Bold.ttf" \
  "extras/ttf/Inter-ExtraBold.ttf" \
  "extras/ttf/Inter-Black.ttf" \
  -d "$ASSETS_DIR"

rm -f "$TMP_ZIP"
echo "Done. Fonts installed to $ASSETS_DIR"
