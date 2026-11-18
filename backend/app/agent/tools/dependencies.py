from dataclasses import dataclass

import httpx
from fastapi import Request

from app.agent.tools.registry import ToolRegistry
from app.agent.tools.travel.weather import OpenMeteoWeatherClient, WeatherTool
from app.core.config import settings


@dataclass(frozen=True)
class ToolRuntime:
    registry: ToolRegistry
    client: httpx.AsyncClient


def create_tool_runtime() -> ToolRuntime:
    client = httpx.AsyncClient(timeout=settings.tool_request_timeout)  # 单次http 请求的超时
    weather_tool = WeatherTool(
        OpenMeteoWeatherClient(
            client,
            max_attempts=settings.tool_max_attempts,
            retry_base_delay=settings.tool_retry_base_delay,
        ),
        timeout=settings.tool_timeout,  # 整体工具执行的超时时间
    )

    return ToolRuntime(
        registry=ToolRegistry([weather_tool]),
        client=client,
    )


def get_tool_registry(request: Request) -> ToolRegistry:
    runtime = getattr(request.app.state, "tool_runtime", None)

    if runtime is None:
        raise RuntimeError("Tool runtime is not initialized")
    return runtime.registry
