# Travel Copilot

AI 旅行助手学习项目（React 19 + FastAPI + PostgreSQL）。

- 架构与路线图：[docs/architecture.md](docs/architecture.md)
- 当前进度：[PROGRESS.md](PROGRESS.md)

## 启动

```bash
docker compose up -d                                  # PostgreSQL
cd backend && uv sync && uv run uvicorn app.main:app --reload
cd frontend && npm install && npm run dev
```

打开 http://localhost:5173 ，页面应显示后端与数据库健康状态。
