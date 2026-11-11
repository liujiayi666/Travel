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
| 6 | 2026-10-29 | 路线调整：先打通单轮 Chat 与 Provider，再加入只读工具和资源权限 |
| 7 | 2026-11-03 | 路线重排：先完成可用文本对话与多轮上下文，再进入流式、Tool、Agent Loop、RAG 和长期记忆 |
| 8 | 2026-11-04 | 路线调整：前端只拉取和展示历史；后端持久化 Conversation 并在调用 LLM 前组装有预算的上下文，随后再做 SSE |
| 9 | 2026-11-04 | 完成 A6 单轮 Chat 端到端闭环验收，并明确 Provider 内部请求错误与上游错误的边界 |
| 10 | 2026-11-04 | 完成 A7.1 Conversation / Message 持久化模型、约束、索引与级联测试 |
| 11 | 2026-11-05 | 完成 A7.2 Conversation 列表与 Message 最近一页读取 API，验证服务端所有权过滤和稳定顺序 |
| 12 | 2026-11-05 | 路线修正：A7.3 Conversation 创建 → A7.4 前端真实列表/New Chat/历史 → A7.5 消息发送与服务端上下文 |
| 13 | 2026-11-06 | 完成 A7.3 Conversation 创建 API，明确 title 属于 Conversation、Message 不判断首轮也不修改 title |

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
- Pylance 类型错误不等于运行时报错，Python 不会替我们检查注解；`append` 当前能跑不能证明消息契约正确，必须修类型边界而不是用“能运行”验收
- API 边界错误要先分层：客户端 Schema 不符是 422，内部构造出非法 LLM 请求是 500，Provider 未配置是 503，上游调用或响应异常是 502，等待 Provider 超时是 504
- 密钥不提交 Git 只是最低要求；浏览器代码、响应、日志和工作区都对使用者和调试工具可见，API Key 只能由后端运行环境读取
- 模块级可变 history 会跨用户和并发请求共享，即使测试里能 mock 也不能作为会话存储；Conversation 必须使用请求级查询和所有权过滤
- Alembic autogenerate 只生成差异草稿，不能可靠检测 CheckConstraint、trigger、view 或数据迁移；生成后必须人工补全并验证 upgrade/downgrade
- 只为副作用存在的模型 import 会被 Ruff `F401 --fix` 删除；集中模型注册入口需要明确 `# noqa: F401`
- PostgreSQL `now()` 在同一事务内返回相同事务时间；需要严格消息顺序时应显式写入递增时间，或增加独立 sequence 字段
- 数据库外键负责完整性和级联删除，ORM relationship 只负责对象导航；没有对象导航需求时可暂不添加 relationship，避免跨模块 mapper 加载耦合
- `get_current_user` 只证明登录身份；资源级授权必须把当前 `user_id` 放进查询条件，不能只按资源 ID 查询后再相信调用者
- 路由不存在的 404 body 是 `{"detail":"Not Found"}`；业务资源不存在/非 owner 使用统一业务 404，不能把两种问题混为一谈
- Pydantic Response DTO 的字段类型必须与 ORM 一致：UUID 不能写成 `int`，从 ORM 映射还需要 `from_attributes=True`
- Query 的默认值必须满足自身约束，例如 `default=0, ge=1` 会让正常请求直接返回 422；参数边界和默认值要成对检查
- 不要让 Message Service 通过“历史是否为空”判断首轮并顺便修改 Conversation.title；title 是 Conversation 元数据，应由 Conversation 创建请求中的首条 message 生成，Message 只负责发送与保存本轮消息

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

### A6 单轮非流式 Chat 端到端闭环 — ✓ 2026-11-04（PR #12、#14）

- 训练能力：LLM Provider 边界与最小 HTTP 纵向切片。业务 Service 只依赖应用自己的 DTO 和错误类型，Provider 适配供应商 SDK，fake provider 可无网络验证成功与失败。
- 验收通过：已配置真实模型并完成一问一答；浏览器 Network 只请求应用自己的 `/api/chat`；API Key 未进入前端、响应或日志。
- 验收通过：后端 51 passed、前端 23 passed；Ruff、Oxlint 和 production build 通过；本地 pre-commit/pre-push 门禁生效。
- 可复查测试：`test_chat_returns_only_the_assistant_message`、`test_chat_requires_authentication`、`test_chat_rejects_client_supplied_user_or_model_fields`、`test_chat_rejects_missing_untrusted_origin`、`test_chat_maps_provider_failures`、`test_chat_maps_internal_llm_request_errors_to_500`；Provider 覆盖成功、空响应、空文本、角色转换、超时和 APIError。
- 关键边界：`ChatRequest` 在 HTTP 边界返回 422；Provider 未配置返回 503；上游失败或非法响应返回 502；调用超时返回 504；应用内部构造非法 `LlmRequest` 返回安全的 500，不能伪装成 Bad Gateway。
- 关键代码：`app/llm/contracts.py`、`openai_compatible_provider.py`、`dependencies.py`、`app/chat/router.py`、`service.py`、`presenter.py`、`frontend/src/features/chat/ChatSession.tsx`。
- 学到：LLM API 是无状态函数，单轮请求只提交当前 user 消息；真正的多轮上下文需要 Conversation 持久化和服务端组装，而不是模块级 history。
- 学到：Provider 隔离的价值是业务不依赖 OpenAI SDK 类型；供应商事件、异常和响应字段必须在适配层转换、过滤和映射。
- 学到：错误码应按失败边界分类；`422/500/502/503/504` 不是同一种“LLM 出错”，错误分类错了会误导监控和排障。
- 面试向：我通过内部 DTO、Provider 协议和 fake adapter 隔离了模型供应商，把认证、Origin、输入预算、外部超时和稳定错误映射串成最小纵向切片，并用真实 smoke test 与自动化失败路径共同证明链路，而不是只验证 happy path。

### A7 Conversation 持久化与服务端上下文 — 进行中

- 训练能力：建立服务端权威的 Conversation / Message，理解 LLM 无状态、消息所有权和上下文预算。前端只拉取历史用于展示，发送时只提交当前 `content`；Service 从数据库读取历史并拼装 system + 有限 user/assistant 消息，再调用 Provider。
- 接口演进：新增 Conversation 列表、历史读取和发送消息 API；发送接口不接受客户端提交的完整 history、system 角色、角色标签或模型选择。
- 验收：刷新和多设备可恢复同一 Conversation；第二次提问能正确引用第一轮内容；跨用户读取或发送统一返回 404；fake provider 能断言第二次调用收到服务端组装的有界上下文；超长或超量历史有明确预算策略。
- 明确不做：LLM 总结压缩、向量检索、跨 Conversation 长期记忆、工具调用和 SSE

#### A7.1 Conversation / Message 持久化模型 — ✓ 2026-11-04（commit cf1618b）

- 验收通过：`alembic current` 为 `7729534e9371 (head)`；`alembic check` 无待生成操作；开发库实际存在两张表、两层 CASCADE、三条 CheckConstraint 和两个复合索引
- 可复查测试：`test_conversation_persists_user_and_assistant_messages`、`test_message_rejects_invalid_role`、`test_conversation_rejects_blank_title`、`test_message_rejects_blank_content`、`test_deleting_user_cascades_conversation_and_messages`
- 验收通过：后端 56 passed、前端 23 passed；Ruff、Oxlint、production build 以及 `check.sh full` 通过
- 关键代码：`backend/app/conversations/models.py`、两份 Alembic migration、`backend/app/models.py`、`backend/tests/test_conversation_models.py`
- 学到：所有权只存 Conversation，Message 经 `conversation_id` 间接归属；数据库外键负责完整性和级联，relationship 只负责对象导航
- 学到：复合索引按 `(conversation_id, created_at, id)` 支持过滤、排序、限量读取和稳定 tie-break
- 学到：`alembic check` 只能证明模型与数据库无明显 drift，不能证明 constraint 设计完整，也不能替代真实失败路径测试
- 面试向：我用服务端权威模型、双层外键级联、数据库 CHECK 和复合索引建立 Conversation 基础，并通过真实 PostgreSQL 集成测试证明 role、空白内容和跨层级级联行为，而不是只验证建表成功

#### A7.2 Conversation 列表与消息读取 API — ✓ 2026-11-05（commit 93d94ce、191d53e）

- 验收通过：`GET /api/conversations` 和 `GET /api/conversations/{id}/messages` 已通过统一 router 注册；空列表和空 Conversation 返回 `200 []`
- 验收通过：Conversation 列表只返回当前用户的数据，按 `updated_at DESC, id DESC` 排序；最近消息先降序 limit，再 reverse 为 old → new
- 验收通过：跨用户和不存在 Conversation 返回相同业务 404；`limit` 越界返回 422；响应 DTO 不暴露 `user_id`
- 可复查测试：`test_conversation_api_requires_authentication`、`test_list_conversations_returns_only_current_user_sorted_by_update`、`test_list_conversations_returns_empty_list`、`test_messages_return_empty_list_for_owned_empty_conversation`、`test_messages_return_latest_page_in_chronological_order`、`test_messages_hide_foreign_and_unknown_conversations`、`test_conversation_api_rejects_invalid_limit`
- 验收通过：后端 73 passed、前端 23 passed；Ruff、Oxlint、production build 全部通过
- 关键代码：`app/conversations/router.py`、`schemas.py`、`service.py`、`errors.py`、`app/api/router.py`、`app/core/exception_handler.py`
- 学到：认证回答“你是谁”，ownership 查询回答“你能不能访问这个资源”；两者必须同时存在
- 学到：先获取最近 N 条再 reverse，兼顾固定 query budget 和最终 chronological display
- 学到：HTTP 404 要区分路由不存在与业务资源不存在；Response DTO 是 ORM 到公开 API 的白名单
- 面试向：我用 owner-scoped SQL、有界最近页查询、UUID Response DTO、统一 404 和 HTTP 集成测试建立 Conversation 读取边界，并验证跨用户访问不会泄露资源存在性或聊天内容

#### A7.3 Conversation 创建 API — ✓ 2026-11-06（commit 05945c1、4dcb2e7）

- 训练能力：让真实用户从零创建自己拥有的 ConversationResource，明确 Conversation 只负责资源生命周期，不负责发送消息。
- 接口：`POST /api/conversations` 接受严格 `message` 请求 DTO（`extra="forbid"`）；Owner 来自当前 Session 用户，服务端使用该 `message` 生成不超过 50 字符的初始 title，但不把它保存为 Message。成功返回 `201 + ConversationResponse`，不调用 Provider。
- 验收通过：创建后立即出现在 GET 列表；数据库 owner 与当前用户一致；title 来自请求 message 并规范化、截断；首条和后续 Message 都由同一 Message API 发送，Message Service 不修改 title
- 验收通过：Provider 在 Conversation 创建阶段调用次数为 0；首条消息 Provider 失败返回 502，Conversation 保留但 user/assistant Message 均不落库；前端可复用同一 Conversation ID 重试
- 验收通过：未认证 401；缺少 trusted Origin 403；伪造 user ID/model/title、空白 message 等输入 422；跨用户发送统一 404
- 可复查测试：`test_create_conversation_returns_only_conversation_without_calling_provider`、`test_build_conversation_title_uses_first_message_content`、`test_send_message_returns_only_new_assistant_reply`、`test_first_message_provider_failure_leaves_no_partial_exchange`、`test_conversation_writes_require_trusted_origin`、`test_conversation_writes_reject_client_supplied_fields`、`test_send_message_hides_foreign_conversation_before_provider_call`
- 验收通过：后端 89 passed、前端 23 passed；Ruff、Oxlint、production build 和 `alembic check` 通过
- 关键代码：`backend/app/conversations/router.py`、`schemas.py`、`service.py`、`backend/tests/test_conversation_api.py`、`test_conversation_service.py`
- 明确不做：通过 Conversation API 发送消息、LLM 标题、客户端指定 owner/模型/system prompt、请求幂等
- 学到：Conversation 创建和 Message 发送是两个资源职责；创建请求中的 message 只用于 Conversation.title，未保存为 Message
- 学到：首条和后续消息共用 Message API，由 Service 统一处理 ownership、历史和上下文；不应通过历史空值分支偷偷修改另一个资源的元数据
- 学到：首条消息 502 时 Conversation 已存在，但本轮消息未提交；前端应提示重试并复用同一 conversationId，避免重复创建会话
- 面试向：我把 Conversation 元数据与 Message 发送边界拆开，用确定性 title、严格请求 DTO、owner-scoped 查询、事务化消息写入和失败路径测试证明创建与发送各自可重试且不互相污染

#### A7.4 前端真实会话列表、New Chat 与历史加载 — 后续

- 训练能力：前端只消费应用自己的 Conversation API；Create/List/History 形成可刷新恢复的真实会话入口。
- 验收：New Chat 用本地首条消息创建 Conversation 并取得 UUID，再把同一内容交给 Message 流程发送；Sidebar 使用真实列表；点击 Conversation 加载对应消息；切换会话不会串数据；发送中的用户消息占位与临时乐观状态只在客户端维护。
- 明确不做：让 Conversation API 代替 Message API 发送、Provider 调用和 SSE

#### A7.5 发送消息与服务端上下文组装 — 后续

- 训练能力：首条和后续消息都走同一个 Message API；后端拥有 Conversation 历史和 LLM 上下文来源，发送时只接受当前 content，在 Service 内完成所有权、历史读取、预算、system prompt 组装和 Provider 调用。
- 验收：首条和后续消息使用同一 API；Message Service 不判断是否首轮，也不修改 title；只返回本轮新增的 assistant 回复；两消息同一事务提交；失败不留下半轮数据；第二轮请求能引用第一轮；跨用户发送 404；客户端无法提交 history/system/model；历史条数和字符数有硬上限；Provider 请求由 fake provider 断言。
- 明确不做：LLM 总结压缩、Tool 调用和 SSE

#### A7.6 Conversation 并发发送串行化 — 后续

- 训练能力：同一 Conversation 在多个标签页、设备或快速重复提交下，也必须按唯一顺序读取历史、生成回复和持久化消息。
- 背景：两个 Message 请求可能同时读到相同旧历史并分别调用 Provider，后发请求可能先生成或先落库，导致回复看不到彼此、消息顺序取决于 Provider 完成顺序。
- 方案：Conversation 增加 processing token 与过期时间；发送前原子 lease，失败返回 409 并让前端提示重试；Provider 结束后在 finally 中按 token 释放。Provider 等待期间不持有数据库连接。
- 验收：两个重叠请求只有一个能调用 Provider，另一个返回 409；阻塞式 fake provider 可稳定复现；进程异常后 lease 到期允许恢复；正常完成、Provider 失败和持久化失败都释放占位。
- 明确不做：Redis 锁、独立任务队列和完整 AgentRun 状态机；这些能力在后续 Agent Loop 阶段再升级。

分页协议 TODO（后续优化）：当前 `GET /api/conversations/{id}/messages` 返回消息数组，前端通过“本页是否满 20 条”推断是否存在更早消息；后续前后端统一改为显式分页响应，至少返回 `items` 与 `has_more`，或返回 `next_offset`/cursor。该调整需要同时覆盖分页边界、乐观消息追加和下一分页失败时保留已加载历史，暂不在当前 runtime 修复中处理。

### A8 SSE 流式文本 — 后续

- 训练能力：单向流式协议、增量渲染、取消和错误恢复。流式只改变传输方式，不改变 A7 的服务端 Conversation 与上下文语义。
- 验收：增量文本、正常结束、Provider 中途失败、用户取消和断线都有稳定状态；前端不解析供应商原始事件
- 明确不做：工具状态流和高级历史压缩

### A9 Tool Contract 与单工具闭环 — 后续

- 训练能力：结构化工具调用。LLM 提出 `get_weather(destination, date_range)`，后端独立验证工具名与参数，执行后把结构化结果交还 LLM 生成最终文本。
- 验收：直接回答和工具调用都可被 fake provider 复现；未知工具、非法参数、工具超时和工具失败都有稳定结果；真实 smoke test 证明一次天气问答闭环
- 明确不做：任意多步循环、并行工具、长期记忆和私有资源写入

### A10 Agent Loop、限额、Trace 与 Eval — 后续

- 训练能力：受控循环与可靠性。明确最大步骤、总时长、token/成本上限，以及 completed / failed / cancelled / max_steps_reached 等终止状态。
- 验收：固定 eval 覆盖正常回答、正常工具调用、工具失败、非法参数、达到上限、Provider 失败和取消；记录 run/tool 轨迹、耗时、token 与失败原因
- 明确不做：在核心循环可靠前继续堆叠工具

### A11 RAG 知识检索工具 — 后续

- 训练能力：检索增强生成与来源约束。建立一个小型旅行知识库，完成解析、分块、metadata、索引、Top-K 检索和带来源结果。
- 首个实现优先使用 PostgreSQL 全文检索做 baseline；有明确语义检索需求和数据指标后再引入 pgvector，不先增加独立向量数据库。
- 验收：固定问题能检索到正确片段；无结果时明确降级；回答带可追溯来源；检索超时/失败进入现有 Tool 错误边界；eval 检查检索命中与 groundedness
- 明确不做：把所有聊天消息自动当知识库，或把 RAG 与长期用户记忆混为一谈

### A12 Conversation 历史治理与高级压缩 — 后续

- 训练能力：让长 Conversation 在 token、延迟和成本上限内保持可用。实现稳定分页、保留策略、摘要压缩和质量评估。
- 验收：固定长会话 eval 比较截断与摘要策略；压缩后可引用必要事实且来源可追溯；失败时能降级到确定性预算；用户可查看和删除历史
- 明确不做：把聊天日志直接当长期记忆

### A13 长期记忆工具 — 后续

- 训练能力：用户级长期记忆的写入、检索、更新、冲突和删除。记忆不是原始聊天日志，而是来源明确、可管理的稳定事实或偏好。
- 验收：只有符合规则或经用户确认的事实写入；按 `user_id` 强制过滤；支持查看和删除；冲突有更新时间/确认策略；检索失败不影响普通聊天
- 明确不做：未经用户同意自动保存敏感内容

### A14 Trip 权限、私有知识与写入工具 — 后续

- 训练能力：服务端资源归属与成员权限。模型或用户传入的 `trip_id` 是不可信输入，必须结合当前用户查数据库确认成员关系。
- 目标：建立最小 Trip / TripMember；为 `save_itinerary_item(trip_id, ...)` 和 Trip 私有 RAG 复用统一授权边界；非成员行为不泄露资源是否存在。
- 验收：未认证 401；非成员访问真实 Trip 返回 404；伪造 `trip_id` 的工具调用无法读取或写入；真实 PostgreSQL 覆盖列表隔离、越权拒绝和事务回滚
- 明确不做：没有实际 Agent 工具需求的普通 Trip CRUD 页面

### A15 文件、协作与工程化 — 后续

- 附件上传、WebSocket 协作、性能、缓存、部署和可选 SSR。
- AI 标题作为独立能力实现：Conversation 创建时先根据传入的首条 message 生成确定性标题，后续通过独立接口生成和更新标题。
- 这些能力不得阻塞 Agent 核心主线。

## 下一步

进入 A7.4：接入真实 Conversation 列表、New Chat 和 history。New Chat 用本地首条消息创建 Conversation，随后用返回的 UUID 调用 Message API；发送中的占位与失败重试状态由前端维护。

后续顺序：

1. A6：单轮非流式 Chat 端到端闭环 — ✓
2. A7.1：Conversation / Message 持久化模型 — ✓
3. A7.2：Conversation 列表与消息读取 API — ✓
4. A7.3：Conversation 创建 API — ✓
5. A7.4：前端真实会话列表、New Chat 与历史加载
6. A7.5：发送消息与服务端上下文组装
7. A7.6：Conversation 并发发送串行化
8. A8：SSE 流式文本
9. A9：Tool Contract 与天气单工具闭环
10. A10：Agent Loop、限额、Trace 与 Eval
11. A11：RAG 知识检索工具
12. A12：Conversation 历史治理与高级压缩
13. A13：长期记忆工具
14. A14：Trip 权限、私有知识与写入工具
15. A15：文件、协作与工程化

Agent 核心能力不延后到文件上传和协作功能之后。每个 A6–A15 步骤在开始前由 /tutor 补充具体目标、验收和证据要求；验收通过后才更新为完成。

测试环境 TODO（后续学习）：在现有本地 hooks 基础上补 GitHub Actions，区分 unit / integration / e2e 的依赖与数据库配置；生产数据库永远不参与测试。

准备：A7.4 先梳理 New Chat 的两段式提交状态（创建 Conversation → 发送首条 Message），再接入列表、history、切换会话和失败重试；乐观消息只在客户端存在。
