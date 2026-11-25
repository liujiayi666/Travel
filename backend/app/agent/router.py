import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.presenter import to_agent_run_response
from app.agent.schemas import AgentRunResponse
from app.agent.trace_service import get_agent_run
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.db import get_db

router = APIRouter(prefix="/api/runs", tags=["agent-runs"])


@router.get("/{run_id}", response_model=AgentRunResponse)
async def get_run(
    run_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    agent_run, tool_calls = await get_agent_run(
        session,
        user_id=user.id,
        run_id=run_id,
    )
    return to_agent_run_response(agent_run, tool_calls)
