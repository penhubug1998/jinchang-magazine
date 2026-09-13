#!/usr/bin/env bash
# 受控部署：候选产物 → 备份 → 语法检查 → 安装 → 重启 → 健康/内容校验。
# 只在服务器上运行；不做任何删除生产数据的操作，失败自动回滚。
set -Eeuo pipefail
umask 077

STAGE="${STAGE:?需要 STAGE=/tmp/jc-deploy-<TS>}"
TS="${TS:?需要 TS=<时间戳>}"
APP=/opt/jinchang-magazine-admin
NODE=/opt/node-v22.18.0-linux-x64/bin/node
BK="/opt/backups/jinchang-magazine/app-backups/.code-backups/$TS"
UNIT=jinchang-magazine-admin.service
TREE="$STAGE/tree"
MANIFEST="$STAGE/manifest.sha256"
BASE_URL=http://127.0.0.1:4180

log(){ printf '\n=== %s ===\n' "$*"; }
fail(){ printf '\n!!! %s\n' "$*" >&2; exit 1; }

log "0. 候选产物自检"
[ -d "$TREE" ] || fail "候选目录不存在"
[ -f "$MANIFEST" ] || fail "缺少 manifest"
[ -f "$TREE/scripts/studio-v3.mjs" ] || fail "候选缺少 studio-v3.mjs"
( cd "$TREE" && sha256sum -c "$MANIFEST" >/dev/null ) || fail "候选 manifest 校验失败"
FILE_COUNT=$(wc -l < "$MANIFEST")
echo "候选文件：$FILE_COUNT"

log "1. 语法检查（.mjs）"
while read -r path; do
  case "$path" in
    *.mjs) "$NODE" --check "$TREE/$path" || fail "语法检查失败：$path" ;;
  esac
done < <(awk '{print $2}' "$MANIFEST")
echo "语法检查通过"

log "2. 部署基线"
NRESTARTS_BEFORE=$(systemctl show "$UNIT" -p NRestarts --value)
ACTIVE_BEFORE=$(systemctl show "$UNIT" -p ActiveState --value)
echo "NRestarts=$NRESTARTS_BEFORE ActiveState=$ACTIVE_BEFORE"
mkdir -p "$BK/tree" "$BK/users-db"
cp -a /opt/jinchang-magazine-admin/.v3-users/users.db* "$BK/users-db/" 2>/dev/null || true
ls -la "$BK/users-db/" | tail -5

log "3. 备份将被覆盖的生产文件"
NEW_FILES=()
CHANGED=0
while read -r path; do
  src="$TREE/$path"; dst="$APP/$path"
  if [ -f "$dst" ]; then
    if ! cmp -s "$src" "$dst"; then
      mkdir -p "$BK/tree/$(dirname "$path")"
      cp -a "$dst" "$BK/tree/$path"
      CHANGED=$((CHANGED+1))
    fi
  else
    NEW_FILES+=("$path")
  fi
done < <(awk '{print $2}' "$MANIFEST")
printf '内容有变化：%s 个\n新增文件：%s 个 %s\n' "$CHANGED" "${#NEW_FILES[@]}" "${NEW_FILES[*]:-}"
printf '%s\n' "${NEW_FILES[@]:-}" > "$BK/new-files.txt"
( cd "$APP" && find scripts src baselines -type f | LC_ALL=C sort | xargs sha256sum; sha256sum package.json ) > "$BK/pre-deploy-manifest.sha256"

rollback(){
  log "回滚"
  while read -r path; do
    if [ -f "$BK/tree/$path" ]; then
      install -D -o root -g root -m 644 "$BK/tree/$path" "$APP/$path"
    fi
  done < <(awk '{print $2}' "$MANIFEST")
  if [ -s "$BK/new-files.txt" ]; then
    while read -r path; do [ -n "$path" ] && rm -f "$APP/$path"; done < "$BK/new-files.txt"
  fi
  systemctl restart "$UNIT" || true
  for _ in $(seq 1 40); do
    sleep 0.5
    curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1 && { echo "回滚后健康检查通过"; return 0; }
  done
  echo "回滚后仍未健康，请人工介入" >&2
  return 1
}

log "4. 安装候选文件"
while read -r path; do
  install -D -o root -g root -m 644 "$TREE/$path" "$APP/$path"
done < <(awk '{print $2}' "$MANIFEST")
echo "已安装 $FILE_COUNT 个文件"

log "5. 重启服务"
systemctl restart "$UNIT"
HEALTHY=0
for _ in $(seq 1 60); do
  sleep 0.5
  if curl -fsS "$BASE_URL/api/health" >/tmp/health.json 2>/dev/null; then HEALTHY=1; break; fi
  systemctl is-active --quiet "$UNIT" || break
done
if [ "$HEALTHY" != 1 ]; then
  echo "--- journalctl 最近 40 行 ---"; journalctl -u "$UNIT" -n 40 --no-pager || true
  rollback || true
  fail "服务未健康，已回滚"
fi
cat /tmp/health.json; echo

log "6. 运行时校验"
echo "ActiveState=$(systemctl show "$UNIT" -p ActiveState --value) NRestarts=$(systemctl show "$UNIT" -p NRestarts --value) UMask=$(systemctl show "$UNIT" -p UMask --value)"
systemctl status "$UNIT" --no-pager | grep -E "Memory|Tasks|CGroup" | head -5 || true
grep -E "VmRSS|VmSwap" /proc/$(systemctl show "$UNIT" -p MainPID --value)/status || true
ls -la "$APP/.v3-users/" | head -6
journalctl -u "$UNIT" -n 15 --no-pager | tail -15
echo
echo "部署完成：$TS"
