# Travel Copilot — Claude 兼容入口

本仓库的唯一协作、技术和教学约定在 [AGENTS.md](AGENTS.md)。开始任何任务前先完整读取它，并以其中内容为准。

Claude 专用 skill 位于 `.claude/skills/`，它们只负责路由到 `.agents/skills/` 下的 canonical 指令，避免维护两份流程。
