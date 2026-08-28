#!/bin/bash
# Build an unsigned Apple Silicon DMG from a clean macOS arm64 dependency tree.
set -euo pipefail

node_version="${NODE_VERSION:-24.15.0}"
architecture="arm64"
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
dist_root="$project_root/dist/macos"
cache_root="$project_root/.release-cache"
package_json="$project_root/package.json"
version="$(node -p "require('$package_json').version")"
mac_short_version="$(node -e "import('$project_root/src/server/app-meta.mjs').then(({ deriveMacOSVersions }) => process.stdout.write(deriveMacOSVersions('$version').shortVersion))")"
mac_bundle_version="$(node -e "import('$project_root/src/server/app-meta.mjs').then(({ deriveMacOSVersions }) => process.stdout.write(deriveMacOSVersions('$version').bundleVersion))")"
app_name="所往 SUOWANG.app"
app_root="$dist_root/$app_name"
payload_root="$app_root/Contents/Resources/app"
dmg_path="$dist_root/SUOWANG-${version}-mac-arm64.dmg"
checksums_path="$dist_root/SUOWANG-${version}-mac-arm64-SHA256SUMS.txt"
node_archive="node-v${node_version}-darwin-${architecture}.tar.gz"
node_url="https://nodejs.org/dist/v${node_version}/${node_archive}"
node_cache="$cache_root/$node_archive"
node_extract="$cache_root/node-v${node_version}-darwin-${architecture}"
dmg_stage="$cache_root/dmg-stage-${version}-mac-arm64"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS release builds must run on macOS." >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "macOS release builds must run on Apple Silicon (arm64)." >&2
  exit 1
fi
if [[ ! -d "$project_root/node_modules/better-sqlite3" ]]; then
  echo "better-sqlite3 is missing. Run npm ci on this Apple Silicon Mac first." >&2
  exit 1
fi

copy_item() {
  local relative_path="$1"
  local source="$project_root/$relative_path"
  local destination="$payload_root/$relative_path"
  if [[ ! -e "$source" ]]; then
    echo "Required release item is missing: $relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$destination")"
  cp -R "$source" "$destination"
}

rm -rf "$app_root" "$dmg_path" "$checksums_path" "$dmg_stage"
mkdir -p "$payload_root" "$app_root/Contents/MacOS" "$cache_root"

release_items=(
  "assets/mainline-scene-bright-office-v1-no-arrows-geometry-v5.png"
  "assets/mainline-scene-bright-office-v1-arrow-restore-light-v2.png"
  "assets/mainline-scene-bright-office-v1-arrow-work-light-v4.png"
  "assets/mainline-scene-bright-office-v1-arrow-life-light-v2.png"
  "index.html"
  "LICENSE"
  "THIRD_PARTY_NOTICES.md"
  "MACOS-README.txt"
  "migrations"
  "scripts/launcher-config.mjs"
  "scripts/serve.mjs"
  "src/server/launcher-policy.mjs"
  "src"
  "package.json"
  "node_modules/better-sqlite3"
  "node_modules/node-addon-api"
)
for item in "${release_items[@]}"; do copy_item "$item"; done

if [[ ! -f "$node_cache" ]]; then
  echo "Downloading Node.js v${node_version} macOS arm64 runtime..."
  curl --fail --location --silent --show-error "$node_url" --output "$node_cache"
fi
if [[ ! -x "$node_extract/bin/node" ]]; then
  rm -rf "$node_extract"
  tar -xzf "$node_cache" -C "$cache_root"
fi
cp -R "$node_extract" "$payload_root/runtime"

sed \
  -e "s/__SUOWANG_SHORT_VERSION__/$mac_short_version/g" \
  -e "s/__SUOWANG_BUNDLE_VERSION__/$mac_bundle_version/g" \
  "$project_root/installer/macos/Info.plist" > "$app_root/Contents/Info.plist"
cp "$project_root/scripts/macos-launcher.sh" "$app_root/Contents/MacOS/SUOWANG"
chmod 755 "$app_root/Contents/MacOS/SUOWANG" "$payload_root/runtime/bin/node"

pushd "$payload_root" >/dev/null
./runtime/bin/node --version
./runtime/bin/node -e "import('better-sqlite3').then(() => console.log('better-sqlite3 runtime OK'))"
smoke_data_dir="$(mktemp -d)/SUOWANG"
SUOWANG_DATA_DIR="$smoke_data_dir" ./runtime/bin/node -e "import('./scripts/serve.mjs').then(async ({ createAppServer }) => { const server = await createAppServer({ ensureBackup: false }); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); const response = await fetch('http://127.0.0.1:' + server.address().port + '/health'); const health = await response.json(); if (health.status !== 'ok' || health.app !== 'suowang') throw new Error('health smoke failed'); await new Promise((resolve) => server.close(resolve)); console.log('packaged health smoke OK'); })"
rm -rf "$(dirname "$smoke_data_dir")"
popd >/dev/null

mkdir -p "$dmg_stage"
cp -R "$app_root" "$dmg_stage/$app_name"
ln -s /Applications "$dmg_stage/Applications"
hdiutil create -volname "所往 SUOWANG" -srcfolder "$dmg_stage" -ov -format UDZO "$dmg_path" >/dev/null
rm -rf "$dmg_stage"
shasum -a 256 "$dmg_path" | awk -v name="$(basename "$dmg_path")" '{ print $1 " *" name }' > "$checksums_path"

echo "macOS DMG: $dmg_path"
echo "SHA-256: $checksums_path"
