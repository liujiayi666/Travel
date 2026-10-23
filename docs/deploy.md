# 部署路线图（香港方案）

> 目标：前后端部署到一台香港服务器，通过域名 HTTPS 访问。
> 路线：免备案。服务器用腾讯云轻量（香港），域名腾讯云注册。

## 当前状态（2026-10-16）

- ✅ backend 已容器化（Dockerfile + compose api service，PR #4）
- ✅ postgres 一直在 compose 里
- ⬜ 服务器 / 域名 / Caddy / 前端镜像

## 目标架构

```
浏览器
  │ https://域名
  ▼
Caddy（监听 443，自动 HTTPS 证书）
  ├── /          → 前端静态文件（npm run build 产出的 dist/）
  └── /api/*     → 反代给 backend 容器 (uvicorn:8000)
                     └── db 容器 (postgres)
```

核心概念：dev 时 `/api` 转发靠 Vite proxy；生产环境没有 Vite，
`npm run build` 出静态文件由 Caddy 托管，`/api` 转发换 Caddy 干。

## Step 1 — 买服务器（腾讯云轻量·香港）

- 控制台 → 轻量应用服务器 → 创建
- 地域：中国香港；镜像：Ubuntu 24.04 LTS 纯净系统；套餐最低档 2C2G
- 创建时设置 root 密码
- **创建完立刻**：实例详情 → 防火墙 → 放行 TCP `8000`（临时验收）、`80`、`443`
- 验收：SSH 能登录 `ssh root@IP`

## Step 2 — 买域名 + 解析

- 腾讯云域名注册（`.top` 首年几块钱；实名认证当天生效）
- DNSPod 加 A 记录：`@` → 服务器公网 IP
- 验收：`ping 域名` 返回服务器 IP

## Step 3 — 服务器初始化

```bash
ssh root@服务器IP
curl -fsSL https://get.docker.com | sh   # 香港直连官方源，不需要 mirror
docker --version
```

注意：本机 `~/.docker/daemon.json` 里的 registry-mirrors 是国内网络专用，
服务器上**不要**配。

## Step 4 — 代码上服务器（Deploy key，只读）

```bash
# 服务器上
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

GitHub 仓库 → Settings → Deploy keys → 粘贴公钥（不勾 write）。

```bash
git clone git@github.com:liujiayi666/Travel.git && cd Travel
docker compose up -d
curl localhost:8000/healthz            # 服务器自测
```

Mac 浏览器访问 `http://IP:8000/healthz` → `"database": "connected"` 即公网可达。
域名解析生效后换 `http://域名:8000/healthz` 再验一次。

## Step 5 — Caddy（关键代码，手写 Caddyfile）

- compose 加 caddy service，80/443 映射到宿主机
- Caddyfile 两个职责：托管前端静态文件 + `/api/*` 反代给 api:8000
- HTTPS 证书全自动（Let's Encrypt），前提：域名 A 记录已生效
- 收尾：防火墙关掉 8000（uvicorn 不再直接暴露公网）

## 面试一句话

容器保证环境一致（同一份 compose 本地/服务器行为相同），
反向代理按路径分发前后端流量，Caddy 自动化证书续期——
部署链路里每一跳都能说出"为什么需要它"。
