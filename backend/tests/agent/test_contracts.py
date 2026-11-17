from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.agent.contracts import ToolDefinition, ToolResult
from app.llm.contracts import LlmAssistantMessage, LlmResponse


def test_tool_definition_requires_object_parameters() -> None:
    with pytest.raises(ValidationError, match="object JSON Schema"):
        ToolDefinition(
            name="get_weather",
            description="Get weather",
            parameters={"type": "string"},
        )


def test_successful_tool_result_requires_provenance() -> None:
    with pytest.raises(ValidationError, match="requires data, source and time"):
        ToolResult(
            call_id="call_1",
            name="get_weather",
            status="success",
            data={"temperature": 18},
        )

    result = ToolResult(
        call_id="call_1",
        name="get_weather",
        status="success",
        data={"temperature": 18},
        source="open-meteo",
        observed_at=datetime.now(UTC),
    )

    assert result.status == "success"


def test_failed_tool_result_requires_error_code() -> None:
    with pytest.raises(ValidationError, match="requires error_code"):
        ToolResult(
            call_id="call_1",
            name="get_weather",
            status="error",
        )


def test_llm_response_requires_exactly_one_output() -> None:
    with pytest.raises(ValidationError, match="exactly one"):
        LlmResponse()

    response = LlmResponse(
        message=LlmAssistantMessage(content="西湖"),
    )

    assert response.tool_call is None
