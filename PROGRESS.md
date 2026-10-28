# Progress

> 本文件是 /tutor 和 /accept 的数据源：/tutor 按它教学，/accept 验收后更新它。
> 路线图：docs/architecture.md 第 16 节。

## 学习模式

手写关键代码加深理解：Codex 给目标、讲解和 TODO 骨架，关键代码由我写；开发与运行命令默认由我跑，明确委托的机械性 Git 操作由 Codex 执行。每步 /accept 验收通过才算完成。

## 目标与能力主线

学习目标是转向 AI Agent 工程，不以堆叠全栈功能为目标。后续每个 step 都应尽量落到下列能力之一，并在 /accept 中记录可复查证据。

| 能力 | 需要产出什么证据 |
|---|---|
| LLM Provider 边界 | 业务层不依赖供应商原始事件；用 fake provider 可测试切换与失败 |
| Tool contract | Schema 校验、权限检查、超时、错误返回和非法参数测试 |
| Agent loop | 明确状态机、最大步骤/时长/token、成功/失败/取消都能终止 |
| Prompt injection 与权限 | 越权、恶意工具参数和跨用户访问都有拒绝用例 |
| Trace 与成本 | 可查看 run/tool 轨迹、耗时、token 和失败原因 |
| Eval | 固定场景集覆盖正常、工具失败、越权、达到上限和可接受降级 |

这些能力从首次接入 LLM 开始逐步建立，不等到所谓“Agent 阶段”才开始。

## Session 记录

| # | 日期 | 内容 |
|---|---|---|
| 1 | 2026-10-15 | 模式确立：mentor 模式 + /tutor /accept skill + 参考骨架入库 |
| 2 | 2026-10-16 | P0-6 backend 容器化（插入步）+ 部署路线图（docs/deploy.md） |
| 3 | 2026-10-23 | 路线调整：认证优先；完成 User / AuthSession 模型和首份 Alembic 迁移 |
| 4 | 2026-10-27 | 完成 Cookie Session Route、统一错误映射与 Origin 校验 |
| 5 | 2026-10-28 | 完成公共 App Shell、Chat 动作级认证弹框与按会话隔离的草稿状态 |

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
- VS Code 从仓库根目录自动导入时可能生成 `backend.app.*`；后端运行时的工作目录是 `backend/`，必须使用 `app.*`
- FastAPI 传统 `Depends()` 默认参数会触发 Ruff B008；依赖声明应放进 `Annotated`，依赖仍在每个请求执行
- 同一缺失 Cookie 对不同接口语义不同：`/me` 必须 401，`/logout` 已处于目标状态，应保持幂等并返回 204
- 404 表示路由没有匹配；先确认实际运行的进程/容器和目标模块，再排查认证中间件或 dependency
- 测试环境保护不仅要设置隔离库，还要在收集用例前校验实际数据库名；统一命令入口与分 stage 编排是后续课题
- 草稿放在 Composer 局部 `useState` 会随 Chat 切换复用或组件卸载而丢失；跨 Chat 草稿应按 `chatId` 提升到稳定 Provider
- 401 表示凭证无效或过期，应映射为 `anonymous`；500、网络失败和响应解析失败表示认证状态无法确认，应进入 `error`，不能伪装成未登录
- 前端登录弹框只负责用户体验，不是权限边界；即使绕过 UI，后端仍必须独立拒绝未认证请求和越权资源访问
- URL 参数属于不可信外部输入，不能直接作为普通对象属性读取：`toString`、`__proto__` 会命中原型链。键值存储使用 `Map`，并限制外部 ID 到已知合法集合

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

### A3 认证 Service 与 HTTP 契约 — ✓ 2026-10-26

- 目标：定义注册 / 登录 / 公开用户的 Pydantic Schema，创建请求级数据库 Session，实现注册、登录、查当前用户、退出的业务 Service
- 验收：邮箱规范化及并发唯一冲突处理正确；注册和 Session 创建处于同一事务；密码、原始 token 和摘要边界清晰
- 概念：dependency、事务边界、ORM Model 与 API Schema 分离、业务错误转换
- A3.1 Schema、异步数据库依赖与健康检查 — ✓ 2026-10-23：`pytest` 7 passed、Ruff clean；AsyncSession 使用 `psycopg_async`，请求结束自动关闭
- A3.2 注册 Service 与 PostgreSQL 集成测试 — ✓ 2026-10-26：在 `travel_test` 上 3 passed；验证邮箱规范化、User/AuthSession 同事务提交、密码/token 摘要边界和重复邮箱回滚
- 学到：Service 在 `flush` 时暴露邮箱唯一约束冲突，rollback 后转换为业务异常；原始 token 只返回给 Route，数据库保存 SHA-256 摘要
- 学到：注册成功必须用新 Session 反查 User 和 AuthSession，才能证明 commit 后数据真实持久化
- A3.3 登录 Service — ✓ 2026-10-26：完整测试 13 passed、Ruff clean；错误密码与未知邮箱统一为 `InvalidCredentialsError`，每次成功登录新增独立 AuthSession
- 学到：邮箱查询用 `scalar_one_or_none()` 明确“零或一条”的契约，不用 `scalar()` 静默吞掉数据异常
- 上线前待加固：未知邮箱与错误密码的 Argon2 时间差、登录 rate limit
- A3.4 主动退出 Service — ✓ 2026-10-26：认证 Service 测试 7 passed、完整测试 14 passed；按 token 摘要删除 Session，重复退出与未知 token 均保持幂等
- 学到：退出只撤销当前设备对应的 AuthSession；数据库行删除才是服务端失效，清除 Cookie 只是浏览器侧清理
- 学到：幂等退出不先查询 token 是否存在，而是直接 DELETE 后 commit，行为稳定且不泄露 Session 信息
- A3.5 当前用户 Session 校验 — ✓ 2026-10-26：认证 Service 测试 11 passed、完整测试 18 passed；JOIN User/AuthSession，校验 token 摘要与 expires_at，统一拒绝未知、过期和已撤销 Session
- 学到：Opaque Session 每次受保护请求都要查数据库；token_hash 唯一索引把校验成本控制在一次小查询
- 学到：认证只证明请求持有有效凭证；CSRF 防伪造、Trip 成员权限仍需独立校验

### A4 认证 Route、Cookie 与 CSRF — ✓ 2026-10-27

- 目标：实现 register / login / logout / me 路由，由 Route 转换业务异常为 HTTP 状态码，并签发/清除 HttpOnly Session Cookie
- 验收：浏览器自动携带 Cookie；刷新后 `/me` 恢复用户；退出立即失效；未登录受保护接口返回 401；跨站写请求被 Origin 检查拒绝
- 概念：Cookie 属性、Set-Cookie、Origin 校验、HTTP 错误映射、FastAPI dependency
- 验收通过：合法注册 `201`、登录 `200`、错误密码 `401`、跨站 Origin `403`；浏览器刷新后 `/me` 恢复用户，退出 `204` 后 `/me` 返回 `401`，重复退出仍为 `204`
- 验收通过：最终 Ruff、format 与 pytest 由用户确认全部通过；pytest 启动保护会强制 `APP_ENV=test` 和 `travel_test`，数据库名不符时在收集用例前终止
- 关键代码（用户手写）：`app/auth/cookies.py`、`dependencies.py`、`errors.py`、`router.py` 与认证配置
- 外围（Codex 代写并讲解）：pytest 测试数据库启动保护
- 学到：Session Cookie 的安全性来自多个属性协同：HttpOnly 限制脚本读取，SameSite 限制跨站自动携带，Secure 由环境决定，Path 决定发送范围，服务端 expires_at 才是最终有效性依据
- 学到：依赖按职责拆分：optional token 只提取凭证，required token 负责拒绝缺失凭证，current user 组合数据库校验；同一 Cookie 在 `/me` 和 `/logout` 上应映射为不同的 HTTP 语义
- 学到：Origin 校验是 SameSite 之外的显式防线，必须精确比较 scheme + host + port，并拒绝缺失或 `null`；它只保护状态修改请求
- 学到：清除 Cookie 只处理浏览器副本，服务端删除 AuthSession 才完成当前设备的凭证撤销；重复退出返回 204 是为了客户端可安全重试
- 面试向：基于 opaque Session 的认证把“浏览器持有原始 token”和“数据库保存摘要”分开，再通过请求级 dependency、统一错误映射与 Origin 校验，把身份恢复、撤销和 CSRF 防护收敛到清晰的安全边界

### A5 公共 App Shell、认证弹框与按会话草稿 — ✓ 2026-10-28（commit 88a72ba, 94d450e）

- 目标：匿名和登录用户都进入同一 App Shell；启动时通过 `/api/auth/me` 恢复身份；匿名用户提交 Chat 时打开认证弹框，不引入 `/login` 重定向；不同 Chat 保留各自草稿
- 验收通过：用户确认 `npm test`、`npm run lint`、`npm run build` 无问题；浏览器验证 Kyoto / Islands 草稿互不串、匿名提交弹框、登录后草稿保留、退出后清空
- 可复查测试：`ChatDraftProvider > keeps separate drafts while switching between chats`、`ChatDraftProvider > preserves anonymous drafts across login and clears them on logout`、`ChatDraftProvider > treats toString / __proto__ as a regular draft key`、`resolveChatId > rejects unsafe URL key toString / __proto__`、`Composer > edits and submits the draft`、`Composer > blocks submission while the session is unknown`
- 关键边界：`checking` 只等待身份恢复；`anonymous` 才打开登录框；`error` 表示认证状态未知并禁止发送；前端不读取 Cookie，也未使用 `localStorage` / `sessionStorage` 保存 token；`chat` URL 参数先经过合法 ID 解析
- 关键代码：`frontend/src/features/chat/ChatDraftProvider.tsx`、`ChatDraftContext.ts`、`routes/ChatPage.tsx`、`features/chat/Composer.tsx`
- 分工：用户完成 Composer 状态与 `state/actions` 合约的初版判断；Codex 补全草稿 Provider、路由接线、显式状态和测试，并逐文件讲解
- 学到：跨页面或跨资源的客户端状态要放在稳定 Provider 中，并按稳定资源 ID 建索引；Composer 只消费 `state + actions`，认证和发送决策留在页面容器
- 学到：受控输入每次有效输入都会同步本地 React 状态并触发消费者重渲染，但不会请求后端；submit 读取的是最新渲染状态。若改为非受控输入，则必须额外设计切换、失焦和卸载时的草稿保存
- 学到：匿名登录后保留草稿、退出或切换账号时清空草稿，是体验与隐私的组合契约；状态所有者变化不能简单依赖组件重新挂载，否则登录本身也可能清掉用户刚输入的草稿
- 学到：动态键的查找表应使用 `Map` 或 null-prototype object；外部 URL 参数还要先经过 allowlist / schema 边界，不能把“是字符串”误当成“是合法资源 ID”
- 面试向：公共 App Shell 配合动作级认证拦截，可以在不牺牲匿名浏览的前提下建立登录入口；草稿由按 `chatId` 索引的 Provider 管理，认证状态与纯 UI Composer 解耦，并通过浏览器行为测试和状态迁移测试验证

### A6 Trip 最小创建与读取 — 下一步

- 训练能力：服务端资源归属与成员权限。Agent 工具未来可以接收用户提供的 `trip_id`，所以必须在写入数据库前独立验证当前用户是否有权访问该 Trip，不能相信前端或模型参数
- 目标：建立最小 `Trip` 与 owner `TripMember` 数据模型、Alembic 迁移、请求级 Schema、Service 与认证 API；实现创建 Trip、列出当前用户可访问 Trip、读取单个 Trip
- 接口契约：`POST /api/trips`、`GET /api/trips`、`GET /api/trips/{tripId}`；创建时 Trip 与 owner membership 在同一事务提交
- 最小字段：Trip 标题、目的地、开始日期、结束日期；预算与人数等字段在第一条 Trip 纵向切片跑通后再补，避免把通用 CRUD 一次做满
- 验收：未认证请求返回 401；创建者可在列表中读回并刷新后仍存在；非成员读取同一 ID 返回 404，避免通过状态码泄露资源是否存在；数据库确认 owner membership 与 Trip 同事务持久化
- 证据要求：真实 PostgreSQL 集成测试覆盖创建、列表隔离、非成员访问和回滚；迁移 `upgrade` / `downgrade` 可执行；前端至少展示创建后的 Trip 并刷新读回
- 运行与证据：pytest 集成测试名称、Alembic revision、浏览器 Network / 页面结果；本步不接 LLM，也不先引入缓存库
- 状态：待开始；进入后由 `/tutor` 先出权限与状态边界热身题，再给 TODO 骨架

## 下一步

进入 A6：Trip 最小创建与读取。关键学习点不是 CRUD，而是用服务端 Trip 成员权限建立未来 Agent 工具调用的资源边界。前端仍只消费应用自己的 `/api`，不得读取或持久化 HttpOnly Session token。

后续顺序：

1. A6：Trip 最小创建与读取
2. A7：Provider 边界 + 非流式 Chat + Message 持久化
3. A8：Agent 核心（单工具、循环、限额、trace、eval）
4. A9：SSE 流式展示、取消与错误恢复
5. 文件上传、WebSocket 协作、工程化与性能专项

Agent 核心能力不延后到文件上传和协作功能之后。每个 A6–A8 步骤在开始前由 /tutor 补充具体目标、验收和证据要求。

测试环境 TODO（后续学习）：评估 nox/tox 或 Makefile 等统一入口，区分 unit / integration-local / integration-CI / e2e 的依赖与数据库配置；生产数据库永远不参与测试。

准备：注册 platform.deepseek.com 拿 API Key（`sk-` 开头），A7 接入 LLM 前放进 `backend/.env`；A6 不需要该密钥。
