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

## Phase 0 — 项目骨架（重写参考骨架）

### P0-0 参考骨架入库 — 进行中

- 验收：git log 里有 reference skeleton 的 commit；本文件由我本人更新过
- 概念：git 基础、monorepo 布局（frontend/ + backend/ 为什么放一个仓库）

### P0-1 理解 frontend 脚手架 — 待开始

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
