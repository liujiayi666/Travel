---
name: accept
description: 验收当前 step：用户跑验收命令，Codex 看输出并 review 代码，通过后更新 PROGRESS.md（✓ + 学到点 + 易错本）并给面试向小结。说"验收/做完了/检查一下"时使用。
---

# accept — 验收与进度更新

1. **读标准**：读 PROGRESS.md 当前 step 的验收标准。
2. **跑验收**：命令由用户执行（pytest / ruff / lint / 浏览器验证），Codex 看输出判定。
3. **review 代码**：Read 本次改动，查正确性 + 架构约定（组件不直连 LLM、secrets 不进前端、TS strict 等）；给 1–3 条改进建议，不阻塞通过。
4. **更新进度**：通过 → Codex 更新 PROGRESS.md：step 打 ✓、写"学到"要点、把 review 中用户的典型错误记入"易错本"、下一步设为进行中；不通过 → 列差距，回 /tutor 流程。git commit 由用户执行。
5. **生成 checkpoint**：先问用户"这步你觉得学到了什么"，再结合本次 diff 在 docs/checkpoints.html 追加条目（commit hash、日期、标题、3–5 个知识点、一句面试向总结）。
6. **小结**：3–5 条本步学习小结，面试叙述向（能讲出为什么，不是 API 清单）。
