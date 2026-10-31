#!/usr/bin/env bash
# Atomic release: copy frontend dist into releases/TIMESTAMP and flip current symlink
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
FE_DIST="${ROOT}/bilibili-live-h5-plugin/dist"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="${DEPLOY}/releases/${TS}"

if [[ ! -d "$FE_DIST" ]]; then
  echo "[release] missing ${FE_DIST}; run scripts/build.sh first" >&2
  exit 1
fi

mkdir -p "${DEPLOY}/releases"
mkdir -p "$DEST"
cp -a "${FE_DIST}/." "$DEST/"

# Flip symlink atomically (replace plain dir if leftover from first setup)
ln -sfn "releases/${TS}" "${DEPLOY}/current.new"
rm -rf "${DEPLOY}/current"
mv -f "${DEPLOY}/current.new" "${DEPLOY}/current"

# keep last 10 releases
ls -1dt "${DEPLOY}/releases"/*/ 2>/dev/null | tail -n +11 | xargs -r rm -rf

echo "[release] current → releases/${TS}"
echo "[release] edge STATIC_ROOT should be ${DEPLOY}/current (restart edge if needed)"
