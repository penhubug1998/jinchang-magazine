#!/usr/bin/env bash
# 在本地仓库里打包候选产物（scripts/ src/ baselines/ package.json）。
set -Eeuo pipefail
REF="${1:?用法: package.sh <git-ref>}"
OUT="${2:-/tmp/deploy-kit}"
rm -rf "$OUT/stage"
mkdir -p "$OUT/stage/tree"
cd "$(git rev-parse --show-toplevel)"
git archive "$REF" scripts src baselines package.json | tar -x -C "$OUT/stage/tree"
( cd "$OUT/stage/tree" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum > ../manifest.sha256 )
echo "REF=$REF SHA=$(git rev-parse --short "$REF")"
echo "文件数：$(wc -l < "$OUT/stage/manifest.sha256")"
tar czf "$OUT/candidate.tgz" -C "$OUT/stage" tree manifest.sha256
ls -la "$OUT/candidate.tgz"
