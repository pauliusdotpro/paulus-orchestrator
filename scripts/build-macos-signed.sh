#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
CERTS_DIR="${HOME}/Documents/AppleCerts"
CSC_LINK_PATH="$CERTS_DIR/Certificates.p12"
APPLE_API_KEY_PATH="$(find "$CERTS_DIR" -maxdepth 1 -type f -name 'AuthKey_*.p8' | head -n 1)"
APPLE_API_KEY_ID="$(basename "$APPLE_API_KEY_PATH" .p8)"
APPLE_API_KEY_ID="${APPLE_API_KEY_ID#AuthKey_}"
APPLE_API_ISSUER="${APPLE_API_ISSUER:?APPLE_API_ISSUER must be set}"
SIGNING_IDENTITY="$(security find-identity -v -p codesigning | sed -n 's/.*\"\(Developer ID Application:.*\)\"/\1/p' | head -n 1)"

for required_path in "$CSC_LINK_PATH" "$APPLE_API_KEY_PATH"; do
  if [[ ! -f "$required_path" ]]; then
    echo "Missing required signing file: $required_path" >&2
    exit 1
  fi
done

if [[ -z "$APPLE_API_KEY_ID" ]]; then
  echo "Missing App Store Connect API key file in $CERTS_DIR" >&2
  exit 1
fi

if [[ -z "$SIGNING_IDENTITY" ]]; then
  echo "Missing Developer ID Application identity in keychain" >&2
  exit 1
fi

cd "$DESKTOP_DIR"

rm -rf dist out

export CSC_LINK="$CSC_LINK_PATH"
export CSC_KEY_PASSWORD=""
export APPLE_API_KEY="$APPLE_API_KEY_PATH"
export APPLE_API_KEY_ID
export APPLE_API_ISSUER

arch="$(uname -m)"
case "$arch" in
  arm64)
    electron_builder_arch="arm64"
    ;;
  x86_64)
    electron_builder_arch="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $arch" >&2
    exit 1
    ;;
esac

version="$(node -p "require('./package.json').version")"

bunx electron-vite build
bunx electron-builder --config electron-builder.yml --publish never --mac "--$electron_builder_arch"

app_path="$DESKTOP_DIR/dist/mac-$electron_builder_arch/Paulus Orchestrator.app"
dmg_path="$DESKTOP_DIR/dist/Paulus-Orchestrator-$version-mac-$electron_builder_arch.dmg"

xcrun stapler staple "$app_path"
codesign --force --sign "$SIGNING_IDENTITY" --timestamp "$dmg_path"
xcrun notarytool submit "$dmg_path" \
  --key "$APPLE_API_KEY_PATH" \
  --key-id "$APPLE_API_KEY_ID" \
  --issuer "$APPLE_API_ISSUER" \
  --wait
xcrun stapler staple "$dmg_path"

echo "Built signed macOS artifacts in $DESKTOP_DIR/dist"
