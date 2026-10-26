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
| 3 | 2026-10-23 | 路线调整：认证优先；完成 User / AuthSession 模型和首份 Alembic 迁移 |

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
- SQLAlchemy 类型参数属于类型构造器：写 `String(320)`、`DateTime(timezone=True)`，不是 `Column` / `mapped_column` 的额外参数
- `Base` 是应用自定义的 DeclarativeBase；模型从 `app.core.db` 引入它。只有模型模块被导入后，表才注册进共享的 `Base.metadata`
- Ruff format 不整理 import；`I001` 用 `ruff check --fix`。Python 缩进决定语法结构，文件无法解析时格式化器不会猜修复意图
- Alembic 的 Ruff `console_scripts` runner 找不到 Ruff 的 Python 入口；仓库使用 `exec` runner，并同时执行 `ruff check --fix` 和 `ruff format`
- `PasswordHash.recommended()` 是类方法，不是 `PasswordHash().recommended()`；Argon2id 是 `pwdlib` 当前推荐哈希器
- `hashlib.sha256()` 接收字节而不是字符串；`digest()` 是 32 字节，`hexdigest()` 是便于存 `VARCHAR(64)` 的 64 字符摘要
- Session token 使用 32 字节（256 位）安全随机数，不是 32 位；`random` 不是密码学安全随机源
- SQLAlchemy 异步功能依赖 `greenlet`，项目需要声明 `sqlalchemy[asyncio]`；psycopg 异步 URL 使用 `postgresql+psycopg_async://`，Alembic 再转回同步驱动
- Pydantic `mode="before"` validator 收到原始输入，字段类型尚未生效；需要字符串方法时先检查类型，或把 validator 放到 after 阶段
- `display_name` 需要 before validator 先 strip 再校验长度；密码不能 strip，使用 after validator 只拒绝全空白输入
- `@pytest.mark.anyio` 只控制异步测试的事件循环，不会自动连接数据库；真实入库来自测试中创建 Engine 并执行 Service
- 数据库集成测试必须在隔离的 `travel_test` 数据库运行；随机测试数据与 `finally` 清理只能作为补充，不能防止误用开发库
- SQLAlchemy 包装数据库错误为 `sqlalchemy.exc.IntegrityError`，不是直接捕获底层 `psycopg.IntegrityError`

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

## Phase A — 认证优先（提前实施）

### A1 User / AuthSession 数据模型与首份迁移 — ✓ 2026-10-23

- 验收通过：`pytest` 2 passed；Alembic `upgrade head` 成功，版本 `4ed703ed0583`；在 PostgreSQL 中确认两张表、主键、唯一约束、索引和 `ON DELETE CASCADE`
- 关键代码（用户手写）：`app/core/db.py` 的共享 Base / 约束命名、`app/auth/models.py` 的两个 typed mapping 模型
- 外围（Codex 代写并讲解）：Alembic 配置、连接配置、迁移后置 Ruff hooks
- 学到：`Mapped[T]` + `mapped_column` 让 Python 类型与数据库列映射在同一处表达；Session 独立建表使多设备登录与立即撤销成为可能；数据库只保存 token 摘要，原始 token 留给浏览器 Cookie
- 学到：模型元数据、迁移文件与真实数据库是三层需要分别验证的结构；Alembic 生成迁移后仍要检查约束名称、外键行为和 downgrade

### A2 密码与 Session token 安全工具 — ✓ 2026-10-23

- 验收通过：`pytest` 7 passed，覆盖 Argon2id、随机 salt、正确/错误密码、URL-safe token 和 SHA-256 摘要
- 关键代码（用户手写）：`app/core/security.py` 四个安全原语
- 外围（Codex 代写并讲解）：`tests/test_security.py` 行为测试
- 学到：密码使用带随机 salt 的 Argon2id；Session token 来自操作系统安全随机源，因熵足够高而可用确定性的 SHA-256 摘要建立数据库索引
- 学到：原始 Session token 只进入 HttpOnly Cookie，数据库只保存摘要；密码和 token 的威胁模型不同，因此哈希算法选择不同

### A3 认证 Service 与 HTTP 契约 — 进行中

- 目标：定义注册 / 登录 / 公开用户的 Pydantic Schema，创建请求级数据库 Session，实现注册、登录、查当前用户、退出的业务 Service
- 验收：邮箱规范化及并发唯一冲突处理正确；注册和 Session 创建处于同一事务；密码、原始 token 和摘要边界清晰
- 概念：dependency、事务边界、ORM Model 与 API Schema 分离、业务错误转换
- A3.1 Schema、异步数据库依赖与健康检查 — ✓ 2026-10-23：`pytest` 7 passed、Ruff clean；AsyncSession 使用 `psycopg_async`，请求结束自动关闭
- A3.2 注册 Service 与 PostgreSQL 集成测试 — ✓ 2026-10-26：在 `travel_test` 上 3 passed；验证邮箱规范化、User/AuthSession 同事务提交、密码/token 摘要边界和重复邮箱回滚
- 学到：Service 在 `flush` 时暴露邮箱唯一约束冲突，rollback 后转换为业务异常；原始 token 只返回给 Route，数据库保存 SHA-256 摘要
- 学到：注册成功必须用新 Session 反查 User 和 AuthSession，才能证明 commit 后数据真实持久化

## 下一步

A3.3 登录、当前用户和退出 Service：完成 Session 校验、过期判断、撤销和统一凭据错误；仍先不接 FastAPI 路由。

后续顺序：后端注册 / 登录 / 退出 / me → React Router 登录页与 App Shell → Trip → 非流式 Chat → SSE。

准备：注册 platform.deepseek.com 拿 API Key（`sk-` 开头），后续放进 `backend/.env`；现在 A2 还不需要该密钥。
