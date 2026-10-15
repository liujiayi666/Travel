# Progress

> 本文件是 /tutor 和 /accept 的数据源：/tutor 按它教学，/accept 验收后更新它。
> 路线图：docs/architecture.md 第 16 节。

## 学习模式

手写关键代码加深理解：Claude 给目标、讲解和 TODO 骨架，代码我写、命令我跑；每步 /accept 验收通过才算完成。

## Session 记录

| # | 日期 | 内容 |
|---|---|---|
| 1 | 2026-10-15 | 模式确立：mentor 模式 + /tutor /accept skill + 参考骨架入库 |

## 易错本

（/accept 验收时记录典型错误，开工前先扫一遍）

- fetch 非 2xx **不会**进 catch（只有网络层失败才 reject）→ 先查 `response.ok` 再 `json()`
- HTTP 层状态和应用层 body.status 是两回事：后端上报 degraded = 后端在工作，不是请求失败
- 端口是一对约定：改 uvicorn `--port` 必须同步 vite proxy target；不确定就 `lsof -i :端口` 查
- compose 的 published 端口改动必须同步 backend/.env 连接串；挂载路径要匹配镜像版本的目录布局（pg18 → `/var/lib/postgresql`）

## Phase 0 — 项目骨架（重写参考骨架）

### P0-0 参考骨架入库 — ✓ 2026-10-15（commit 78e2af9）

- 验收通过：commit 存在；踩坑一次（终端不在仓库目录跑 git 报 not a git repository）
- 学到：.git 是仓库数据库；commit 是快照基线，供后续 diff 对照

### P0-1 理解 frontend 脚手架 — ✓ 2026-10-15

- 验收通过：dev server 跑起来；三道思考题全对（`!` 断言 / StrictMode 双渲染 / HMR）
- 学到：入口是 index.html；Vite 双身份（dev server 按需编译 / build 全量打包）；StrictMode 是暴露副作用的破坏性测试

### P0-2 vite proxy + App.tsx 健康页 — ✓ 2026-10-15

- 验收通过：页面显示 degraded/unreachable（DB 未起，诚实上报）；Network 实证 StrictMode 双请求
- 学到：fetch 两层状态（HTTP 层 response.ok / 应用层 body.status）；error 态 = 拿不到可信答案，degraded 是后端在工作

### P0-3 docker-compose 手写 — ✓ 2026-10-15

- 验收通过：手写 compose 起 postgres:18-alpine，healthy，浏览器 connected（Phase 0 链路闭环）
- 踩坑：pg18 数据目录布局变更，老挂载路径失效 → 读日志 + 搜索定位，down -v 清脏卷重来
- 学到：image/container/volume/healthcheck；报错三段式（原因/现状/建议）；compose 端口 ↔ .env 连接串是一对约定

### P0-4 backend 逐文件重写 — 进行中

- 不重新生成：frontend/ 直接用 Claude 生成的参考版，由 Claude 逐文件讲解
- 验收：`npm install && npm run dev` 跑起来；能说出每个生成文件的作用、哪些是脚手架噪音
- 概念：脚手架是什么、Vite 的角色（dev server + 构建）、TS strict、ESLint flat config

### P0-2 vite proxy + App.tsx 健康页 — 待开始

- 验收：手写 fetch /api/healthz，页面三态（loading / ok / fail）；能答出 StrictMode 双请求现象及应对
- 概念：useState/useEffect、TS 判别联合类型建模状态、dev proxy 原理

### P0-3 docker-compose 手写 — 待开始

- 前置：`mv docker-compose.yml docker-compose-ref.yml`
- 验收：手写 compose 起 postgres:18-alpine，healthcheck 通过；能讲 image / container / volume / healthcheck
- 概念：Docker 三件套、named volume 持久化、端口映射

### P0-4 backend 逐文件重写 — 待开始

- 分工：pyproject.toml 由 Claude 代写讲解；core/config.py、core/db.py、main.py、tests 由用户手写（关键代码）
- 顺序：pyproject.toml → uv sync → core/config.py → core/db.py → main.py → tests
- 验收：`uv run pytest` 全绿 + `uv run ruff check .` 无告警；DB 断连时 healthz 返回 degraded 而不是 500
- 概念：uv/pyproject（类比 package.json）、pydantic-settings、SQLAlchemy engine、FastAPI 路由

### P0-5 端到端验收 + Phase 0 小结 — 待开始

- 验收：浏览器 5173 显示 DB connected；能讲清完整链路（Vite proxy → uvicorn → psycopg → PG）
- 概念：请求链路全景

## 下一步

P0-0：确认参考骨架是否已 commit（上一条消息里的 git 命令），没跑就先跑。
