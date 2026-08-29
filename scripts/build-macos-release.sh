#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
cd "$project_root"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "macOS desktop release builds require an Apple Silicon runner." >&2
  exit 1
fi

version="$(node -p "require('./package.json').version")"
dist_root="$project_root/dist/macos"
forge_app="$project_root/out/所往 SUOWANG-darwin-arm64/所往 SUOWANG.app"
dmg_path="$dist_root/SUOWANG-${version}-mac-arm64.dmg"
checksums_path="$dist_root/SUOWANG-${version}-mac-arm64-SHA256SUMS.txt"
signing_status="UNSIGNED"
if [[ -n "${APPLE_CODESIGN_IDENTITY:-}" ]]; then signing_status="SIGNED"; fi
export SUOWANG_SIGNING_STATUS="$signing_status"
export SUOWANG_FORCE_NATIVE_REBUILD=1

mkdir -p "$dist_root"
rm -rf "$forge_app" "$dmg_path" "$checksums_path"

npm run desktop:prepare
npx electron-forge make --platform=darwin --arch=arm64
node scripts/verify-desktop-package.mjs

if [[ ! -d "$forge_app" ]]; then
  echo "Forge did not create the expected arm64 app: $forge_app" >&2
  exit 1
fi
generated_dmg="$(find "$project_root/out/make" -type f -name "SUOWANG-${version}-mac-arm64.dmg" -print -quit)"
if [[ -z "$generated_dmg" ]]; then
  echo "Forge did not create the expected DMG." >&2
  exit 1
fi
cp "$generated_dmg" "$dmg_path"

if [[ "$signing_status" == "SIGNED" ]]; then
  codesign --verify --deep --strict --verbose=2 "$forge_app"
  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    xcrun notarytool submit "$dmg_path" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait
    xcrun stapler staple "$dmg_path"
    xcrun stapler validate "$forge_app"
    xcrun stapler validate "$dmg_path"
    signing_status="SIGNED+NOTARIZED"
  fi
fi

(cd "$dist_root" && shasum -a 256 "$(basename "$dmg_path")" | awk '{ print $1 " *" $2 }' > "$(basename "$checksums_path")")
printf '%s\n' "$signing_status" > "$dist_root/SIGNING-STATUS.txt"
echo "macOS DMG: $dmg_path"
echo "Signing status: $signing_status"
