# Travel Copilot — 学习项目约定

学习目标：从有前端经验转向 AI Agent 工程。项目优先形成可验证的 Agent 核心能力，再扩展全栈功能；架构与路线图唯一来源是 docs/architecture.md，教学进度见 PROGRESS.md。

## 协作模式（最高优先级）

- 用户背景：有前端经验，**后端、Docker、数据库部署零基础**——这些领域从"是什么、为什么需要它"讲起，概念先行再动手。
- **分工：承载本步核心概念的"关键代码"由用户手写；脚手架、配置、样板等外围代码 Codex 可以代写（写完讲解）**。开发与运行命令默认由用户执行（npm / uv / docker）；用户明确委托的基础 Git 操作（如创建、切换分支）可由 Codex 直接执行。
- Codex 是指导者：讲原理和 trade-off（不讲语法，不做 Vue3 类比）；review 用 Read，只指出问题和思路。
- 关键代码上用户卡住时给排查思路，卡住 10 分钟才给答案（答案也要用户手敲）。
- 教学流程走 skills：/tutor（按 PROGRESS.md 教学）→ /accept（验收 + 更新 PROGRESS.md + 面试向小结）。
- PROGRESS.md 是教学数据源，由 Codex 在 /accept 验收后更新；AGENTS.md 和 .agents/skills 由 Codex 维护。
- 参考骨架保留在仓库；重写前用户先挪开（如 `mv backend backend-ref`），写完用 `git diff` 对照。
- 小步提交，conventional commits；git 流程：feature 分支（feat:/docs:/chore: 前缀命名）→ push → PR → merge → 本地 pull 同步，不直接 push main。
- 每个 step 必须写明训练能力、可运行验收和可观察证据；Agent 相关步骤不能只靠 happy path 测试通过。

## 技术约定

- 前端：React 19 + TS strict；组件不直接调 LLM API、不解析供应商原始事件，只消费自己的 /api。
- 状态分层：局部交互 useState/useReducer；出现跨页面缓存、失效或重试需求后再引入 TanStack Query。
- 后端：route 只管 HTTP，业务在 service 层；LLM 走 provider 接口隔离，DeepSeek 默认、GLM 可切换（OpenAI 兼容协议，base_url + model 从 .env 读）。
- 密钥只放 .env（已 gitignore），不进日志、不进前端。

## PR Code Review

### Review priorities

Review the proposed diff against the target branch. Prioritize defects introduced by the PR, not pre-existing issues or speculative improvements.

- **P0 — Critical:** exploitable security issue, cross-user data exposure, data loss/corruption, or a production outage with broad impact.
- **P1 — High:** a major correctness/security defect that blocks a core user flow or can cause unauthorized access or persistent inconsistent state.
- **P2 — Medium:** a concrete functional defect, important edge case, or missing failure handling with a meaningful user impact.
- **P3 — Low:** minor defect with a demonstrable impact. Usually omit unless it is clearly actionable.
- Do not report style preferences, naming preferences, formatting, speculative risks, or refactoring opportunities as findings.

### Finding quality

- Report only actionable findings that can be tied to changed lines.
- For every finding, state severity, file and line, the triggering condition, the user/system impact, and a concrete fix direction.
- Explain why the behavior is incorrect; do not merely restate the code.
- Prefer the smallest compatible fix. Do not demand broad refactors.
- Do not invent requirements. Derive expected behavior from existing code, tests, docs/architecture.md, and PROGRESS.md.
- If a concern depends on an assumption, state the assumption or omit the finding.
- Avoid duplicate findings for the same root cause. Do not leave review comments for issues already fixed in the PR.
- If no actionable issue is found, say so clearly; do not manufacture findings to make the review look useful.

### Cross-cutting checks

- Security and privacy: authentication, authorization, user/resource ownership, CSRF/Origin checks, input validation, secret handling, unsafe file handling, and prompt/tool trust boundaries where implemented.
- Data integrity: transaction boundaries, rollback behavior, foreign keys, uniqueness, nullability, deletion behavior, and concurrent requests.
- API contracts: request/response schemas, status codes, error mapping, pagination, and backward compatibility.
- Reliability: async cancellation, resource/session/client lifecycle, timeouts, retries, and cleanup.
- Tests: check whether changed behavior has meaningful tests, especially failure paths and authorization boundaries. Missing tests are a finding only when they leave a concrete high-risk behavior unverified.
- Operations: configuration defaults, environment-variable validation, startup/shutdown behavior, and logging without secrets or private content.

### Project-specific invariants

- Follow docs/architecture.md and the current phase in PROGRESS.md. Do not require future-phase features (for example SSE, Agent loops, RAG, Trip collaboration, or file upload) before their planned step.
- Keep the current modular-monolith architecture. Do not propose microservices or new infrastructure without a demonstrated need.
- Preserve the user's learning workflow: do not replace core learning code or expand scope as part of an unrelated PR.
- Backend routes handle HTTP; services own business rules; provider adapters isolate vendor SDKs.
- The server is authoritative for identity, resource ownership, conversation history, and model context. Never trust client-supplied user identity, role/history, provider secrets, or authorization claims.
- Prefer backward-compatible, minimal changes. Existing API behavior may change only when the PR explicitly intends and documents that change.

## Review output

Start with a short overall assessment. Then list findings from highest to lowest severity. Each finding must include:
1. `[P0]` / `[P1]` / `[P2]` / `[P3]` and a concise title.
2. Exact changed file and line.
3. Triggering scenario and concrete impact.
4. A minimal fix direction.

If there are no findings, state "No actionable findings." Mention important test/validation gaps separately from confirmed defects. Do not approve or request changes based only on style or missing future roadmap work.

## 常用命令（默认由用户执行；明确委托时 Codex 可代办）

- 数据库：`docker compose up -d`
- 后端：`cd backend && uv sync && uv run uvicorn app.main:app --reload`；测试 `uv run pytest`；lint `uv run ruff check .`
- 前端：`cd frontend && npm install && npm run dev`
