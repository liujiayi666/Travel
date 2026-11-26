# 部署手册

> 目标：使用 Docker Compose 和 Caddy 部署相互隔离的线上 dev 与 prod。

## 当前状态

- ✅ 后端已有本地开发镜像和 Docker Compose 配置
- ✅ CI 已覆盖前后端 lint、测试和构建
- ⬜ 单环境 production 容器栈
- ⬜ Caddy 同域代理
- ⬜ 镜像发布流程
- ⬜ 线上 dev
- ⬜ 线上 prod

## 目标架构

```text
          dev 服务器                         prod 服务器
     https://dev.example.com            https://example.com
              │                                 │
           Caddy                             Caddy
              │                                 │
        dev 应用栈                        prod 应用栈
  前端静态文件 + api-dev               前端静态文件 + api-prod
              │                                 │
           db-dev                            db-prod
        独立 volume                        独立 volume
```

Caddy 是公网入口，负责 HTTPS、前端静态文件和 `/api/*` 反向代理。
FastAPI 和 PostgreSQL 只在 Docker 内部网络可达，不直接暴露公网端口。

首版每个环境使用独立主机。两个环境栈都需要监听宿主机 `80/443`；
如果直接放在同一台机器，后启动的 Caddy 会因端口冲突失败。后续确需共用一个
主机时，应单独设计共享 ingress，而不是同时启动两个 edge。

## 环境契约

| 项目 | 本地 | 线上 dev | 线上 prod |
| --- | --- | --- | --- |
| 前端 | Vite dev server | production build | production build |
| 后端 | uvicorn `--reload` | production 镜像 | production 镜像 |
| `APP_ENV` | development | production | production |
| 数据库 | 本地 PostgreSQL | 独立 dev 数据库 | 独立 prod 数据库 |
| 模型密钥 | 本地限额密钥 | dev 专用密钥 | prod 专用密钥 |
| 发布来源 | 工作区 | `main` | 版本 tag，人工批准 |
| 数据可删除重建 | 可以 | 可以 | 不可以 |

线上 dev 也使用 `APP_ENV=production`。环境名称不等于代码运行模式：
只要服务对公网开放，就必须使用 production build、关闭热更新，并启用 Secure Cookie。

## 配置边界

可以提交进 Git：

- `deploy/env/local.env.example`
- `deploy/env/dev.env.example`
- `deploy/env/prod.env.example`
- 非敏感域名和配置项名称
- 占位符与配置说明

只保存在服务器：

- dev 与 prod 的真实 `.env`
- 数据库密码
- LLM Provider API Key
- SSH 私钥

服务器文件建议放在：

```text
/opt/travel/dev/.env
/opt/travel/prod/.env
```

文件权限设为 `600`。真实 `.env` 已被 `.gitignore` 排除。

## 实施顺序

1. **D0 理解请求链路**

   必须能解释：

   ```text
   浏览器 → DNS → Caddy → 前端静态文件或 FastAPI → PostgreSQL
   ```

2. **D1 固定环境契约**

   使用 `deploy/env/*.env.example` 创建服务器配置。dev 和 prod 必须使用：

   - 不同域名；
   - 不同数据库容器与 volume；
   - 不同数据库密码；
   - 不同 LLM API Key；
   - 不同部署目录。

3. **D2 验证前端 production build**

   运行 `npm run build`，由 Caddy 托管 `dist/`。线上不使用 `npm run dev`。

   生产构建按稳定缓存边界拆分：

   - `ChatRoute` 按路由懒加载；
   - `AuthModal` 在需要登录时加载；
   - React、数据层依赖和其他第三方依赖分别进入稳定 vendor chunk；
   - 入口 CSS 与路由、弹框 CSS 分开；
   - JavaScript、CSS、字体、图片分别进入 `assets/js`、`assets/css`、
     `assets/fonts`、`assets/images`；
   - 所有产物带内容哈希，并执行首屏 gzip 预算检查。

4. **D3 制作可部署的后端镜像**

   镜像需要包含 FastAPI 代码、Alembic 配置和迁移文件，并提供健康检查。

5. **D4 在本地搭一套 production 风格环境**

   使用 `deploy/compose.yml` 启动 FastAPI 和 PostgreSQL，验证单环境容器栈。

   - `db` 只连接内部 `data` 网络，不发布 5432；
   - `migrate` 使用 API 镜像执行一次 `alembic upgrade head`，成功后退出；
   - `api` 不发布 8000，只允许后续 Caddy 通过 `app` 网络访问；
   - API 同时连接内部数据库网络和可访问 LLM 的普通网络；
   - PostgreSQL 使用 Compose project 独立 volume；
   - 迁移由部署命令显式执行，不能让每个 API 实例启动时争抢迁移。

   本地首次验证：

   ```bash
   cp deploy/env/local.env.example .env
   # 修改 .env 中的数据库密码；不要复用本机 backend/.env
   docker compose --env-file .env -f deploy/compose.yml config --quiet
   bash deploy/up.sh
   ```

   `deploy/up.sh` 只用于本地 dev 构建和启动：它会先构建 API 与 edge
   镜像，再按 `db → migrate → api → edge` 的顺序启动。服务器部署必须使用
   CI 发布的固定镜像并执行 `pull`，不能运行本地构建脚本。

6. **D5 接入 Caddy**

   Caddy 负责：

   - 将页面请求映射到前端静态文件；
   - 将 `/api/*` 转发到 FastAPI；
   - 将未知页面路径回退到 `index.html`；
   - 保持 SSE 响应持续输出；
   - 在服务器上自动管理 HTTPS 证书。

   前端使用多阶段镜像构建，构建后的 `dist/` 被复制进 Caddy 镜像。
   Caddy 与 API 只通过 `app` 网络通信，不经过宿主机端口中转。

   本地路由验收可以把根目录 `.env` 临时设为：

   ```dotenv
   APP_ENV=development
   FRONTEND_ORIGIN=http://localhost
   ```

   启动后验证页面、SPA 回退和 API 同域代理：

   ```bash
   bash deploy/up.sh
   curl -I http://localhost/
   curl -I http://localhost/chat
   curl http://localhost/api/healthz
   ```

   本地验收结束后，把 `APP_ENV` 和 `FRONTEND_ORIGIN` 改回线上 HTTPS 值。

7. **D6 完成本地失败路径验收**

   至少验证：

   - 数据库停止时健康检查如实上报 degraded；
   - 数据库恢复后应用自动恢复；
   - 未登录请求返回 401；
   - 不可信 Origin 的写请求返回 403；
   - 重建应用容器后数据库数据仍存在。

8. **D7 建立镜像发布流程**

   CI 通过后构建并推送镜像到 GHCR，服务器只拉取唯一 commit 对应的镜像。

   - 合并到 `main` 生成 `dev`、`sha-<commit>` 标签；
   - 推送 `v*` tag 生成 `prod`、`sha-<commit>` 和版本 tag；
   - 手动从其他分支运行只发布 `sha-<commit>`，不会覆盖 `dev/prod` 浮动标签；
   - 两个镜像分别发布为 `travel-api` 和 `travel-edge`；
   - 服务器部署使用不可变 `sha-<commit>` 或 digest，不依赖会移动的 `dev/prod` tag；
   - 构建输出包含 provenance 和 SBOM，便于追溯镜像来源与依赖。

9. **D8 部署线上 dev**

   配置服务器、SSH、防火墙、DNS 和 Caddy。公网只开放 `22/80/443`。

   没有域名时，可以先做临时 IP preview：

   - 防火墙只对测试来源开放 `22/80`，不要暴露 `5432/8000`；
   - 使用 `deploy/env/ip-preview.env.example`，设置
     `APP_ENV=development` 和 `FRONTEND_ORIGIN=http://服务器IP`；
   - 使用 GHCR 的 `sha-*` 镜像，不在服务器上构建；
   - `bash deploy/release.sh` 会先备份数据库，再拉取镜像、执行迁移、
     启动 API/edge 并等待健康检查；
   - 该模式没有 HTTPS、Secure Cookie 和自动证书，不能保存真实敏感数据。

   如果服务器无法稳定访问 GHCR，可以在本机拉取并校验官方镜像，通过 SSH
   执行 `docker load` 后使用：

   ```bash
   SKIP_IMAGE_PULL=1 bash deploy/release.sh
   ```

   该选项仍要求 `.env` 指向本地已存在的不可变 SHA 镜像，不能借此部署
   浮动 tag 或来源不明的镜像。

   获得域名后，改回 `APP_ENV=production`、HTTPS 域名和 `80/443`，
   再重新部署。

   自动 dev 部署需要：

   - GitHub Variables：`TCR_REGISTRY`、`TCR_NAMESPACE`、
     `DEPLOY_PUBLIC_URL`，可选 `DEPLOY_PORT`、`DEPLOY_PATH`；
   - GitHub Secrets：`TCR_USERNAME`、`TCR_PASSWORD`、
     `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、
     `DEPLOY_KNOWN_HOSTS`；
   - 服务器预先执行 `docker login` 到 TCR，使部署用户保存只读拉取凭据；
   - Release 将 GHCR 镜像按 digest 同步到 TCR，再由 dev deploy job
     SSH 到服务器更新 `.env`、备份数据库、迁移和健康检查。

10. **D9 部署线上 prod**

    在 dev 验收通过后复制出 prod，但保持域名、数据库、volume、密钥和发布权限完全隔离。

11. **D10 补齐运行保障**

    完成数据库备份与恢复演练、日志、部署前迁移、应用回滚和故障处理。

## 安全规则

- 不在服务器上暴露 PostgreSQL `5432` 或 FastAPI `8000`。
- 不把本机 `backend/.env` 复制到服务器。
- dev 和 prod 不共用模型密钥。
- 生产数据库执行迁移前先备份。
- 生产环境永远不使用 `docker compose down -v`。
- 不把密钥写入镜像、前端代码、日志或 Git。

## 面试表达

容器让同一份构建产物在不同环境保持行为一致；环境差异通过运行时配置注入。
Caddy 作为唯一公网入口处理 TLS、静态资源和反向代理，FastAPI 与 PostgreSQL
只在内网可达。dev 与 prod 使用独立数据库、凭据和发布权限，避免测试流量破坏生产数据。
