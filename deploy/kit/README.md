# 受控部署与生产验证工具

这套脚本是"改代码 → 上生产"的实际流程，之前只存在于开发者本机，交接时补齐到仓库里。

## 1. 打包候选产物（本地）

```bash
bash deploy/kit/package.sh main /tmp/deploy-kit      # 或任意 git ref
# 产出：/tmp/deploy-kit/candidate.tgz（tree/ + manifest.sha256，328 个文件）
```

只打包真正部署到服务器的内容：`scripts/`、`src/`、`baselines/`、`package.json`。

## 2. 受控部署（服务器上以 root 执行）

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
scp /tmp/deploy-kit/candidate.tgz root@<server>:/tmp/
ssh root@<server> "mkdir -p /tmp/jc-deploy-$TS && tar xzf /tmp/candidate.tgz -C /tmp/jc-deploy-$TS \
  && STAGE=/tmp/jc-deploy-$TS TS=$TS bash /tmp/install-candidate.sh"
```

`install-candidate.sh` 的顺序（每一步失败都会中止，并且**不删除任何生产数据**）：

1. 校验候选 manifest（`sha256sum -c`）；
2. 对每个 `.mjs` 跑 `node --check`；
3. 记录部署基线（NRestarts / ActiveState）并备份 `.v3-users/users.db*`；
4. 把将被覆盖的文件复制到 `/opt/backups/jinchang-magazine/app-backups/.code-backups/<TS>/tree/`，
   记录 `pre-deploy-manifest.sha256` 与新增文件清单；
5. `install -D -o root -g root -m 644` 安装（应用目录归 root，服务以 www-data 运行）；
6. 重启服务并等待 `/api/health`；**不健康就自动回滚**（恢复备份文件、删除新增文件、重启）；
7. 打印 ActiveState / NRestarts / UMask / VmRSS / VmSwap 与最近日志。

回滚产物：`.code-backups/<TS>/`（`tree/` 覆盖回原文件，`new-files.txt` 是当时新增的文件）。

## 3. 生产验证脚本

| 脚本 | 用途 |
|---|---|
| `prod-e2e.mjs` | 端到端：建临时账号 → 建刊 → 发布到 `/u/<slug>/NN/` → 忘记密码全流程 → 删除（含派生数据隔离）→ 清理。需要 `ADMIN_PW` |
| `prod-e2e-finish.mjs` | 上面那次中断后的收尾（公网校验 + 删除 + 恢复原状） |
| `prod-session-check.mjs` | 登录设备可见性 / 退出其他设备 |
| `prod-library-check.mjs` | 删除账号时素材库隔离 |
| `mobile-login-check.mjs` | 本机起服务，在 320/360/390 宽的手机尺寸上量登录页与制作中心对话框（溢出、控件尺寸、输入框字号） |

```bash
ssh root@<server> 'set -a; . /etc/jinchang-magazine-admin.env; set +a; \
  ADMIN_USER="${STUDIO_ADMIN_USER:-admin}" ADMIN_PW="$STUDIO_ADMIN_PASSWORD" \
  NODE_TLS_REJECT_UNAUTHORIZED=0 /opt/node-v22.18.0-linux-x64/bin/node /tmp/prod-e2e.mjs'
```

## 4. 部署纪律（血泪换来的）

- **先看 CI，再合并**。私有仓库没有分支保护（Free 计划），红着也能合；改回 public 之后 CI 才有免费额度。
- 合并后再部署，部署后**必须**跑一次生产验证，不要只看 `/api/health` 返回 200。
- 生产目录不 `git init/pull`；代码只通过上面这套"候选 → 校验 → 安装"的方式进去。
- 任何删除都先隔离（`.v3-trash`），任何批量操作先 dry-run。
