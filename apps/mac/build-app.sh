#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/dist"
NODE_VERSION="$(node -p 'process.version' 2>/dev/null || true)"
NODE_ARCHIVE=""
SKIP_WEB_BUILD=false

usage() {
  sed -n '/^# Build a self-contained/,/^# The resulting app includes/p' "$0" | sed 's/^# \{0,1\}//'
}

# Build a self-contained SketchForge.app for the current Mac architecture.
#
# Usage: apps/mac/build-app.sh [options]
#
# Options:
#   --output DIR          Put SketchForge.app in DIR (default: apps/mac/dist).
#   --node-version VER    Bundle this official Node.js release (default: the
#                         version of node used for the web build).
#   --node-archive FILE   Use an already-downloaded official node-VER-darwin-ARCH
#                         .tar.gz archive instead of downloading it.
#   --skip-web-build      Reuse apps/web/.next/standalone from an earlier build.
#   -h, --help            Show this help.
#
# Requirements: macOS 13+, Xcode Command Line Tools, Node.js/npm, curl, and tar.
# The resulting app includes Node.js; end users do not need Node or Docker.

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) OUTPUT_DIR="${2:?--output needs a directory}"; shift 2 ;;
    --node-version) NODE_VERSION="${2:?--node-version needs a version}"; shift 2 ;;
    --node-archive) NODE_ARCHIVE="${2:?--node-archive needs a file}"; shift 2 ;;
    --skip-web-build) SKIP_WEB_BUILD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for command_name in node npm xcrun ditto sips iconutil codesign; do
  command -v "$command_name" >/dev/null || { echo "Required command not found: $command_name" >&2; exit 1; }
done

[[ -n "$NODE_VERSION" ]] || { echo "Node.js is required to build the web application." >&2; exit 1; }
[[ "$NODE_VERSION" == v* ]] || NODE_VERSION="v$NODE_VERSION"

case "$(uname -m)" in
  arm64) NODE_ARCH="arm64"; SWIFT_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64"; SWIFT_ARCH="x86_64" ;;
  *) echo "Unsupported Mac architecture: $(uname -m)" >&2; exit 1 ;;
esac

APP_VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
APP_PATH="$OUTPUT_DIR/SketchForge.app"
CONTENTS="$APP_PATH/Contents"
CACHE_DIR="$SCRIPT_DIR/.cache"
MAC_WEB_ROOT="$CACHE_DIR/web"
MAC_WEB_STANDALONE_RELATIVE="apps/mac/.cache/web"
RUNTIME_ROOT="$CACHE_DIR/node-$NODE_VERSION-darwin-$NODE_ARCH"
DOWNLOADED_ARCHIVE="$CACHE_DIR/node-$NODE_VERSION-darwin-$NODE_ARCH.tar.gz"

mkdir -p "$CACHE_DIR" "$OUTPUT_DIR"
if ! $SKIP_WEB_BUILD; then
  echo "Preparing an isolated MCP-enabled web build..."
  (cd "$REPO_ROOT" && npm run copy:occt)
  node "$SCRIPT_DIR/prepare-web-build.mjs" "$REPO_ROOT/apps/web" "$MAC_WEB_ROOT"
  echo "Building the standalone SketchForge web server..."
  (cd "$REPO_ROOT" && SKETCHFORGE_DOCKER_BUILD=true NEXT_TELEMETRY_DISABLED=1 \
    "$REPO_ROOT/node_modules/.bin/next" build "$MAC_WEB_ROOT")
fi

STANDALONE="$MAC_WEB_ROOT/.next/standalone"
STAGED_SERVER="$STANDALONE/$MAC_WEB_STANDALONE_RELATIVE"
[[ -f "$STAGED_SERVER/server.js" ]] || {
  echo "Standalone server not found at $STAGED_SERVER/server.js" >&2
  echo "Run without --skip-web-build to create it." >&2
  exit 1
}

if [[ ! -x "$RUNTIME_ROOT/bin/node" ]]; then
  if [[ -n "$NODE_ARCHIVE" ]]; then
    [[ -f "$NODE_ARCHIVE" ]] || { echo "Node archive not found: $NODE_ARCHIVE" >&2; exit 1; }
    SOURCE_ARCHIVE="$NODE_ARCHIVE"
  else
    SOURCE_ARCHIVE="$DOWNLOADED_ARCHIVE"
    if [[ ! -f "$SOURCE_ARCHIVE" ]]; then
      NODE_URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-$NODE_ARCH.tar.gz"
      echo "Downloading the official Node.js $NODE_VERSION $NODE_ARCH runtime..."
      curl --fail --location --retry 3 --output "$SOURCE_ARCHIVE.part" "$NODE_URL"
      mv "$SOURCE_ARCHIVE.part" "$SOURCE_ARCHIVE"
    fi
  fi
  tar -xzf "$SOURCE_ARCHIVE" -C "$CACHE_DIR"
fi

echo "Assembling $APP_PATH..."
rm -rf "$APP_PATH"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources/runtime" "$CONTENTS/Resources/server/apps/web/.next"

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(date -u +%Y%m%d%H%M)" "$CONTENTS/Info.plist"

CLANG_MODULE_CACHE_PATH="$CACHE_DIR/clang-module-cache" xcrun swiftc \
  -O \
  -parse-as-library \
  -target "$SWIFT_ARCH-apple-macos13.0" \
  -framework AppKit \
  -framework WebKit \
  "$SCRIPT_DIR/SketchForgeApp.swift" \
  -o "$CONTENTS/MacOS/SketchForge"

cp "$SCRIPT_DIR/SketchForgeMCP" "$CONTENTS/MacOS/SketchForgeMCP"
chmod 755 "$CONTENTS/MacOS/SketchForgeMCP"
cp "$RUNTIME_ROOT/bin/node" "$CONTENTS/Resources/runtime/node"
chmod 755 "$CONTENTS/Resources/runtime/node"
mkdir -p "$CONTENTS/Resources/mcp"
cp "$REPO_ROOT/scripts/sketchforge-mcp-server.mjs" "$CONTENTS/Resources/mcp/sketchforge-mcp-server.mjs"
ditto "$REPO_ROOT/docs/skills/sketchforge-mcp-skill/" "$CONTENTS/Resources/mcp/sketchforge-mcp-skill/"
ditto "$STANDALONE/" "$CONTENTS/Resources/server/"
ditto "$STAGED_SERVER/" "$CONTENTS/Resources/server/apps/web/"
rm -rf "$CONTENTS/Resources/server/apps/mac"
ditto "$MAC_WEB_ROOT/.next/static/" "$CONTENTS/Resources/server/apps/web/.next/static/"
ditto "$MAC_WEB_ROOT/public/" "$CONTENTS/Resources/server/apps/web/public/"

ICONSET="$CACHE_DIR/AppIcon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
ICON_SOURCE="$REPO_ROOT/apps/web/public/assets/sketchforge/sketchforge-logo.png"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"

# Ad-hoc signing makes the nested runtime and app bundle internally consistent.
# Distribution outside the building Mac can replace this with Developer ID signing
# and notarization after this script completes.
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

echo
echo "Created: $APP_PATH"
echo "Architecture: $NODE_ARCH"
echo "Node.js runtime: $NODE_VERSION"
echo "Projects will be stored in: ~/Library/Application Support/SketchForge/Projects"
