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
    client = httpx.AsyncClient(timeout=settings.tool_timeout)
    weather_tool = WeatherTool(
        OpenMeteoWeatherClient(client),
        timeout=settings.tool_timeout,
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
