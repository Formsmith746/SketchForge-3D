#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
APP_PATH="$DIST_DIR/SketchForge.app"
OUTPUT_DMG="$DIST_DIR/SketchForge.dmg"

usage() {
  sed -n '/^# Package the built/,/^# The disk image contains/p' "$0" | sed 's/^# \{0,1\}//'
}

# Package SketchForge.app, the Mac README, and the project license in a disk image.
#
# Usage: apps/mac/build-app-dist.sh [--output FILE]
#
# Options:
#   --output FILE   Write the disk image to FILE
#                   (default: apps/mac/dist/SketchForge.dmg).
#   -h, --help      Show this help.
#
# The disk image contains SketchForge.app, README.md, LICENSE, and an Applications link.

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) OUTPUT_DMG="${2:?--output needs a file path}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for command_name in codesign ditto hdiutil; do
  command -v "$command_name" >/dev/null || { echo "Required command not found: $command_name" >&2; exit 1; }
done

[[ -d "$APP_PATH" ]] || {
  echo "Built application not found: $APP_PATH" >&2
  echo "Run apps/mac/build-app.sh first." >&2
  exit 1
}
[[ -f "$SCRIPT_DIR/README.md" ]] || { echo "README not found: $SCRIPT_DIR/README.md" >&2; exit 1; }
[[ -f "$REPO_ROOT/LICENSE" ]] || { echo "License not found: $REPO_ROOT/LICENSE" >&2; exit 1; }

codesign --verify --deep --strict "$APP_PATH"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sketchforge-dmg.XXXXXX")"
PAYLOAD_DIR="$WORK_DIR/payload"
TEMP_DMG="$WORK_DIR/SketchForge.dmg"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$PAYLOAD_DIR"
ditto "$APP_PATH" "$PAYLOAD_DIR/SketchForge.app"
cp "$SCRIPT_DIR/README.md" "$PAYLOAD_DIR/README.md"
cp "$REPO_ROOT/LICENSE" "$PAYLOAD_DIR/LICENSE"
ln -s /Applications "$PAYLOAD_DIR/Applications"

echo "Creating compressed disk image..."
hdiutil create \
  -volname "SketchForge" \
  -srcfolder "$PAYLOAD_DIR" \
  -format UDZO \
  -ov \
  "$TEMP_DMG"
hdiutil verify "$TEMP_DMG"

mkdir -p "$(dirname "$OUTPUT_DMG")"
mv -f "$TEMP_DMG" "$OUTPUT_DMG"

echo
echo "Created: $OUTPUT_DMG"
