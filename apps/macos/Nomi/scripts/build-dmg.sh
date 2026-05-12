#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/.build/Nomi.app"
DIST_DIR="$ROOT_DIR/.build/dist"
STAGE_DIR="$ROOT_DIR/.build/dmg-stage"
DMG_PATH="$DIST_DIR/Nomi.dmg"

"$ROOT_DIR/scripts/build-app.sh" >/dev/null

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$DIST_DIR"
cp -R "$APP_DIR" "$STAGE_DIR/Nomi.app"
ln -s /Applications "$STAGE_DIR/Applications"
rm -f "$DMG_PATH"

hdiutil create \
  -volname "Nomi" \
  -srcfolder "$STAGE_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

echo "$DMG_PATH"
