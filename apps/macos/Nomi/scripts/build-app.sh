#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/.build/Nomi.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
ICON_STYLE="${NOMI_MACOS_ICON_STYLE:-auto}"

macos_major_version() {
  sw_vers -productVersion | cut -d. -f1
}

resolve_icon_path() {
  case "$ICON_STYLE" in
    auto)
      if [ "$(macos_major_version)" -ge 26 ]; then
        echo "$ROOT_DIR/Sources/Nomi/Resources/AppIcon-macos26.icns"
      else
        echo "$ROOT_DIR/Sources/Nomi/Resources/AppIcon.icns"
      fi
      ;;
    macos26)
      echo "$ROOT_DIR/Sources/Nomi/Resources/AppIcon-macos26.icns"
      ;;
    traditional)
      echo "$ROOT_DIR/Sources/Nomi/Resources/AppIcon.icns"
      ;;
    *)
      echo "Unsupported NOMI_MACOS_ICON_STYLE: $ICON_STYLE" >&2
      echo "Expected auto, macos26, or traditional." >&2
      exit 2
      ;;
  esac
}

cd "$ROOT_DIR"
swift build

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$ROOT_DIR/.build/debug/Nomi" "$MACOS_DIR/Nomi"
if [ -d "$ROOT_DIR/.build/debug/Nomi_Nomi.bundle" ]; then
  cp -R "$ROOT_DIR/.build/debug/Nomi_Nomi.bundle" "$APP_DIR/Nomi_Nomi.bundle"
fi
ICON_PATH="$(resolve_icon_path)"
cp "$ICON_PATH" "$RESOURCES_DIR/AppIcon.icns"
echo "Using macOS app icon: $(basename "$ICON_PATH")" >&2

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>Nomi</string>
  <key>CFBundleIdentifier</key>
  <string>dev.nomi.mac</string>
  <key>CFBundleDisplayName</key>
  <string>Nomi</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleName</key>
  <string>Nomi</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>15.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo "$APP_DIR"
