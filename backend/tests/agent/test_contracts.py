from datetime import UTC, datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.agent.contracts import ToolDefinition, ToolResult
from app.llm.contracts import LlmAssistantMessage, LlmPricing, LlmResponse, LlmUsage


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
    usage = LlmUsage(input_tokens=10, output_tokens=5)

    with pytest.raises(ValidationError, match="usage"):
        LlmResponse.model_validate(
            {
                "message": {
                    "role": "assistant",
                    "content": "西湖",
                }
            }
        )

    with pytest.raises(ValidationError, match="exactly one"):
        LlmResponse(usage=usage)

    response = LlmResponse(
        message=LlmAssistantMessage(content="西湖"),
        usage=usage,
    )

    assert response.tool_call is None


def test_llm_usage_totals_tokens_and_rejects_negative_values() -> None:
    usage = LlmUsage(input_tokens=10, output_tokens=5)

    assert usage.total_tokens == 15

    with pytest.raises(ValidationError):
        LlmUsage(input_tokens=-1, output_tokens=5)
    with pytest.raises(ValidationError):
        LlmUsage(input_tokens=10, output_tokens=-1)


def test_llm_pricing_estimates_cost_from_per_million_prices() -> None:
    pricing = LlmPricing(
        input_usd_per_million=Decimal(1),
        output_usd_per_million=Decimal(2),
    )

    cost = pricing.estimate_cost(
        LlmUsage(input_tokens=220, output_tokens=18),
    )

    assert cost == Decimal("0.000256")
