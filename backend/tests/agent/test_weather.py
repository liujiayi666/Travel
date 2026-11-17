import asyncio
from datetime import date

import httpx
import pytest
from pydantic import ValidationError

from app.agent.contracts import ToolCall
from app.agent.tools.error import ToolExecutionError, ToolTimeoutError
from app.agent.tools.travel.weather import (
    OpenMeteoWeatherClient,
    WeatherDay,
    WeatherForecast,
    WeatherLocation,
    WeatherQuery,
    WeatherTool,
)


def make_forecast() -> WeatherForecast:
    return WeatherForecast(
        location=WeatherLocation(
            name="Hangzhou",
            country="China",
            latitude=30.29,
            longitude=120.16,
            timezone="Asia/Shanghai",
        ),
        days=[
            WeatherDay(
                date=date(2026, 11, 20),
                temperature_min_c=12.1,
                temperature_max_c=19.4,
                precipitation_probability_max=20,
            )
        ],
    )


class FakeWeatherClient:
    def __init__(self, forecast: WeatherForecast) -> None:
        self.forecast = forecast
        self.queries: list[WeatherQuery] = []

    async def get_daily_forecast(self, query: WeatherQuery) -> WeatherForecast:
        self.queries.append(query)
        return self.forecast


class SlowWeatherClient:
    async def get_daily_forecast(self, query: WeatherQuery) -> WeatherForecast:
        await asyncio.sleep(0.05)
        return make_forecast()


def make_call(arguments: dict[str, object] | None = None) -> ToolCall:
    return ToolCall(
        id="call_weather_1",
        name="get_weather",
        arguments=arguments
        or {
            "destination": " Hangzhou ",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        },
    )


def test_weather_query_normalizes_destination_and_accepts_seven_days() -> None:
    query = WeatherQuery(
        destination="  Hangzhou   West Lake ",
        start_date=date(2026, 11, 20),
        end_date=date(2026, 11, 26),
    )

    assert query.destination == "Hangzhou West Lake"


@pytest.mark.parametrize(
    "arguments",
    [
        {
            "destination": "   ",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
        },
        {
            "destination": "Hangzhou",
            "start_date": "2026-11-21",
            "end_date": "2026-11-20",
        },
        {
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-27",
        },
        {
            "destination": "Hangzhou",
            "start_date": "2026-11-20",
            "end_date": "2026-11-20",
            "user_id": "forged",
        },
    ],
)
def test_weather_query_rejects_invalid_arguments(arguments: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        WeatherQuery.model_validate(arguments)


@pytest.mark.anyio
async def test_weather_tool_returns_app_owned_success_result() -> None:
    client = FakeWeatherClient(make_forecast())
    tool = WeatherTool(client, timeout=1)
    call = make_call()

    result = await tool.execute(call)

    assert result.call_id == call.id
    assert result.name == "get_weather"
    assert result.status == "success"
    assert result.source == "open-meteo"
    assert result.observed_at is not None
    assert result.data is not None
    assert result.data["location"]["name"] == "Hangzhou"
    assert client.queries[0].destination == "Hangzhou"


@pytest.mark.anyio
async def test_weather_tool_rejects_mismatched_tool_name() -> None:
    tool = WeatherTool(FakeWeatherClient(make_forecast()), timeout=1)

    with pytest.raises(ToolExecutionError, match="does not match"):
        await tool.execute(
            ToolCall(
                id="call_1",
                name="search_places",
                arguments={},
            )
        )


@pytest.mark.anyio
async def test_weather_tool_timeout_is_a_tool_boundary_error() -> None:
    tool = WeatherTool(SlowWeatherClient(), timeout=0.001)

    with pytest.raises(ToolTimeoutError):
        await tool.execute(make_call())


@pytest.mark.anyio
async def test_open_meteo_adapter_maps_geocoding_and_forecast() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "geocoding-api.open-meteo.com":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "name": "Hangzhou",
                            "country": "China",
                            "latitude": 30.29,
                            "longitude": 120.16,
                            "timezone": "Asia/Shanghai",
                        }
                    ]
                },
            )

        return httpx.Response(
            200,
            json={
                "timezone": "Asia/Shanghai",
                "daily": {
                    "time": ["2026-11-20"],
                    "temperature_2m_min": [12.1],
                    "temperature_2m_max": [19.4],
                    "precipitation_probability_max": [20],
                },
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = OpenMeteoWeatherClient(http_client)
        forecast = await adapter.get_daily_forecast(
            WeatherQuery(
                destination="Hangzhou",
                start_date=date(2026, 11, 20),
                end_date=date(2026, 11, 20),
            )
        )

    assert len(requests) == 2
    assert requests[1].url.params["latitude"] == "30.29"
    assert requests[1].url.params["start_date"] == "2026-11-20"
    assert forecast.location.name == "Hangzhou"
    assert forecast.days[0].temperature_max_c == 19.4


@pytest.mark.anyio
async def test_open_meteo_adapter_supports_chinese_destination_names() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "geocoding-api.open-meteo.com":
            assert request.url.params["name"] == "杭州"
            assert request.url.params["language"] == "zh"
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "name": "杭州",
                            "country": "中国",
                            "latitude": 30.29,
                            "longitude": 120.16,
                            "timezone": "Asia/Shanghai",
                        }
                    ]
                },
            )

        return httpx.Response(
            200,
            json={
                "timezone": "Asia/Shanghai",
                "daily": {
                    "time": ["2026-11-20"],
                    "temperature_2m_min": [12.1],
                    "temperature_2m_max": [19.4],
                    "precipitation_probability_max": [20],
                },
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = OpenMeteoWeatherClient(http_client)
        forecast = await adapter.get_daily_forecast(
            WeatherQuery(
                destination="杭州",
                start_date=date(2026, 11, 20),
                end_date=date(2026, 11, 20),
            )
        )

    assert len(requests) == 2
    assert forecast.location.name == "杭州"
