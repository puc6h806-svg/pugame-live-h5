#!/usr/bin/env bash
# Point current at the release immediately older than the one currently linked
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEPLOY"
mkdir -p releases

mapfile -t ALL < <(find releases -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -rn | awk '{print $2}')

if [[ ${#ALL[@]} -lt 2 ]]; then
  echo "[rollback] need ≥2 releases; found ${#ALL[@]}" >&2
  exit 1
fi

CUR_LINK="$(readlink current 2>/dev/null || true)"
# normalize to releases/TIMESTAMP
CUR_REL=""
if [[ -n "$CUR_LINK" ]]; then
  CUR_REL="${CUR_LINK#./}"
fi

IDX=-1
for i in "${!ALL[@]}"; do
  if [[ "${ALL[$i]}" == "$CUR_REL" ]] || [[ "releases/$(basename "${ALL[$i]}")" == "$CUR_REL" ]]; then
    IDX=$i
    break
  fi
  # also match by absolute
  if [[ "$(readlink -f current 2>/dev/null || true)" == "$(cd "${ALL[$i]}" && pwd)" ]]; then
    IDX=$i
    break
  fi
done

if [[ $IDX -lt 0 ]]; then
  echo "[rollback] current not in releases list; leaving unchanged" >&2
  exit 1
fi
if [[ $((IDX + 1)) -ge ${#ALL[@]} ]]; then
  echo "[rollback] no older release than current (${CUR_REL})" >&2
  exit 1
fi

PREV="releases/$(basename "${ALL[$((IDX + 1))]}")"
ln -sfn "$PREV" current.new
rm -rf current.new.tmp 2>/dev/null || true
# replace current (symlink or dir)
rm -rf current
mv -f current.new current
echo "[rollback] current → ${PREV}"
