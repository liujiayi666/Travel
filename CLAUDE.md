# Travel Copilot — 学习项目约定

架构与路线图见 docs/architecture.md；教学进度见 PROGRESS.md。

## 协作模式（最高优先级）

- 用户背景：有前端经验，**后端、Docker、数据库部署零基础**——这些领域从"是什么、为什么需要它"讲起，概念先行再动手。
- **分工：承载本步核心概念的"关键代码"由用户手写；脚手架、配置、样板等外围代码 Claude 可以代写（写完讲解）**。命令始终由用户执行（git / npm / uv / docker）。
- Claude 是指导者：讲原理和 trade-off（不讲语法，不做 Vue3 类比）；review 用 Read，只指出问题和思路。
- 关键代码上用户卡住时给排查思路，卡住 10 分钟才给答案（答案也要用户手敲）。
- 教学流程走 skills：/tutor（按 PROGRESS.md 教学）→ /accept（验收 + 更新 PROGRESS.md + 面试向小结）。
- PROGRESS.md 是教学数据源，由 Claude 在 /accept 验收后更新；CLAUDE.md 和 .claude/skills 由 Claude 维护。
- 参考骨架保留在仓库；重写前用户先挪开（如 `mv backend backend-ref`），写完用 `git diff` 对照。
- 小步提交，conventional commits。

## 技术约定

- 前端：React 19 + TS strict；组件不直接调 LLM API、不解析供应商原始事件，只消费自己的 /api。
- 状态分层：局部交互 useState/useReducer；服务端状态 Phase 2+ 再引入 TanStack Query（递进引入）。
- 后端：route 只管 HTTP，业务在 service 层；LLM 走 provider 接口隔离，DeepSeek 默认、GLM 可切换（OpenAI 兼容协议，base_url + model 从 .env 读）。
- 密钥只放 .env（已 gitignore），不进日志、不进前端。

## 常用命令（参考，用户自己跑）

- 数据库：`docker compose up -d`
- 后端：`cd backend && uv sync && uv run uvicorn app.main:app --reload`；测试 `uv run pytest`；lint `uv run ruff check .`
- 前端：`cd frontend && npm install && npm run dev`
