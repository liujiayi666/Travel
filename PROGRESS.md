# Progress

> 本文件是 /tutor 和 /accept 的数据源：/tutor 按它教学，/accept 验收后更新它。
> 路线图：docs/architecture.md 第 16 节。

## 学习模式

手写关键代码加深理解：Claude 给目标、讲解和 TODO 骨架，代码我写、命令我跑；每步 /accept 验收通过才算完成。

## Session 记录

| # | 日期 | 内容 |
|---|---|---|
| 1 | 2026-10-15 | 模式确立：mentor 模式 + /tutor /accept skill + 参考骨架入库 |
| 2 | 2026-10-16 | P0-6 backend 容器化（插入步）+ 部署路线图（docs/deploy.md） |

## 易错本

（/accept 验收时记录典型错误，开工前先扫一遍）

- fetch 非 2xx **不会**进 catch（只有网络层失败才 reject）→ 先查 `response.ok` 再 `json()`
- HTTP 层状态和应用层 body.status 是两回事：后端上报 degraded = 后端在工作，不是请求失败
- 端口是一对约定：改 uvicorn `--port` 必须同步 vite proxy target；不确定就 `lsof -i :端口` 查
- compose 的 published 端口改动必须同步 backend/.env 连接串；挂载路径要匹配镜像版本的目录布局（pg18 → `/var/lib/postgresql`）
- 配置在进程启动时读取：改 `.env` 后必须重启进程（uvicorn --reload 只监听 .py，不监听 .env）；改了配置页面没变，先怀疑没重启
- 排查"连不上"类问题的顺序：服务侧真相（compose ps / curl）→ 绕过吞异常的中间层做直连测试 → 查进程实际配置
- base image tag 必须匹配 requires-python（写了 3.9 而项目要 3.12，uv sync 直接炸）
- uv 两套接口别混：`uv pip`（吃 requirements 格式文件）≠ `uv sync`（自动找 pyproject+lock，不接 `-r`）；`.venv` 不在系统 PATH，容器里跑命令要 `uv run` 前缀
- Docker Desktop 的代理/mirror 设置要点 Apply & restart 才落盘；它不继承系统/浏览器代理
- 容器间互访：服务名=主机名 + 容器内部端口；published 端口只在宿主机上有意义
- 国内直连 docker.io 是 DNS 污染（解析到假 IP）→ 走代理或 registry-mirror

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

### P0-4 backend 逐文件讲解 — ✓ 2026-10-15

- 验收通过：pytest 2 passed / ruff clean；三道思考题（惰性、pre_ping、500 vs degraded）
- 学到：配置三层优先级；engine 惰性 + 连接池；健康检查 200+degraded 优于 500（观测信号不失真）；TestClient 测行为契约

### P0-5 端到端验收 + Phase 0 小结 — ✓ 2026-10-15

- 验收通过：杀库实验（stop db → 页面 degraded，start → connected）；首个 PR 全流程（分支→PR→merge→pull→清理）
- 学到：健康检查把"服务可达"与"依赖健康"分层上报，依赖故障不污染存活信号

### P0-6 backend 容器化（插入步）— ✓ 2026-10-16（PR #4）

- 验收通过：`docker compose build && up -d`，`/healthz` 返回 connected；PR squash merge
- 学到：Dockerfile = "从零到能跑"的步骤代码；layer 缓存决定指令排序（依赖清单→装依赖→源码，改代码秒级重构建）；compose 内部网络服务名=主机名；一容器一前台进程（--reload 不进容器）；.dockerignore 挡 .env/.venv 进镜像；国内网络：DNS 污染 → 代理或 mirror
- 关键代码（用户手写）：backend/Dockerfile、compose 的 api service
- 外围（Claude 代写）：backend/.dockerignore

## Phase 0 — 项目骨架（重写参考骨架）— ✓ 2026-10-15 全部完成

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

Phase 1 最小纵向切片（进行中）：前端输入 → `POST /api/chat` → DeepSeek 非流式回复 → 存 Message → 显示（含刷新后历史保留）。

准备：注册 platform.deepseek.com 拿 API Key（sk- 开头），之后放进 `backend/.env`（`DEEPSEEK_API_KEY` 等，不进 git）。

Phase 1 已定案（2026-10-16 讨论）：

- 前端引入 Tailwind v4（@theme 写语义 token，分层：原始色阶 → 语义 → 组件），不引入组件库/路由/TanStack Query
- 数据模型：单表 messages（id, conversation_id, role, content, created_at）；前端 localStorage 存 conversation_id（uuid）；`GET /api/messages?conversation_id=` 拉历史；暂不建 conversations 表
- LLM 走 provider 接口隔离（OpenAI 兼容协议，base_url/model/key 读 .env），DeepSeek 先行；httpx 发请求；Phase 1 非流式
