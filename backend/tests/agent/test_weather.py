import asyncio
from datetime import date

import httpx
import pytest
from pydantic import ValidationError

from app.agent.contracts import ToolCall
from app.agent.tools.errors import (
    ToolExecutionError,
    ToolResultError,
    ToolTimeoutError,
    WeatherDataUnavailableError,
    WeatherLocationNotFoundError,
)
from app.agent.tools.travel.weather import (
    MAX_FORECAST_DAYS,
    OpenMeteoWeatherClient,
    WeatherDay,
    WeatherForecast,
    WeatherLocation,
    WeatherQuery,
    WeatherTool,
)
from app.core.config import Settings

GEOCODING_RESPONSE = {
    "results": [
        {
            "name": "Hangzhou",
            "country": "China",
            "latitude": 30.29,
            "longitude": 120.16,
            "timezone": "Asia/Shanghai",
        }
    ]
}

FORECAST_RESPONSE = {
    "timezone": "Asia/Shanghai",
    "daily": {
        "time": ["2026-11-20"],
        "temperature_2m_min": [12.1],
        "temperature_2m_max": [19.4],
        "precipitation_probability_max": [20],
    },
}


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


def make_open_meteo_adapter(
    client: httpx.AsyncClient,
    *,
    request_timeout: float = 3.0,
    max_attempts: int = 3,
    retry_base_delay: float = 0.001,
) -> OpenMeteoWeatherClient:
    return OpenMeteoWeatherClient(
        client,
        request_timeout=request_timeout,
        max_attempts=max_attempts,
        retry_base_delay=retry_base_delay,
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


class RecoverableWeatherClient:
    def __init__(self, error: ToolResultError) -> None:
        self.error = error
        self.queries: list[WeatherQuery] = []

    async def get_daily_forecast(self, query: WeatherQuery) -> WeatherForecast:
        self.queries.append(query)
        raise self.error


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


def make_query(destination: str = "Hangzhou") -> WeatherQuery:
    return WeatherQuery(
        destination=destination,
        start_date=date(2026, 11, 20),
        end_date=date(2026, 11, 20),
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


def test_weather_location_rejects_oversized_or_out_of_range_fields() -> None:
    with pytest.raises(ValidationError):
        WeatherLocation(
            name="x" * 121,
            country="China",
            latitude=30.29,
            longitude=120.16,
            timezone="Asia/Shanghai",
        )

    with pytest.raises(ValidationError):
        WeatherLocation(
            name="Hangzhou",
            country="China",
            latitude=91,
            longitude=120.16,
            timezone="Asia/Shanghai",
        )


def test_weather_day_rejects_out_of_range_values() -> None:
    with pytest.raises(ValidationError):
        WeatherDay(
            date=date(2026, 11, 20),
            temperature_min_c=-101,
            temperature_max_c=19.4,
            precipitation_probability_max=20,
        )

    with pytest.raises(ValidationError):
        WeatherDay(
            date=date(2026, 11, 20),
            temperature_min_c=12.1,
            temperature_max_c=19.4,
            precipitation_probability_max=101,
        )


def test_weather_forecast_rejects_more_than_supported_days() -> None:
    day = make_forecast().days[0]

    with pytest.raises(ValidationError):
        WeatherForecast(
            location=make_forecast().location,
            days=[day] * (MAX_FORECAST_DAYS + 1),
        )


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
@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (
            WeatherLocationNotFoundError(),
            "weather_location_not_found",
        ),
        (
            WeatherDataUnavailableError(),
            "weather_data_unavailable",
        ),
    ],
)
async def test_weather_tool_maps_recoverable_errors_to_tool_result(
    error: ToolResultError,
    expected_code: str,
) -> None:
    tool = WeatherTool(
        RecoverableWeatherClient(error),
        timeout=1,
    )

    result = await tool.execute(make_call())

    assert result.status == "error"
    assert result.error_code == expected_code
    assert result.data is None
    assert result.source is None
    assert result.observed_at is None


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
        adapter = make_open_meteo_adapter(http_client)
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
        adapter = make_open_meteo_adapter(http_client)
        forecast = await adapter.get_daily_forecast(
            WeatherQuery(
                destination="杭州",
                start_date=date(2026, 11, 20),
                end_date=date(2026, 11, 20),
            )
        )

    assert len(requests) == 2
    assert forecast.location.name == "杭州"


@pytest.mark.anyio
async def test_open_meteo_maps_empty_geocoding_result_to_domain_error() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"results": []})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(http_client)
        with pytest.raises(WeatherLocationNotFoundError):
            await adapter.get_daily_forecast(make_query("Unknown City"))

    assert len(requests) == 1


@pytest.mark.anyio
async def test_open_meteo_rejects_oversized_location_text_before_forecast() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "name": "x" * 121,
                        "country": "China",
                        "latitude": 30.29,
                        "longitude": 120.16,
                        "timezone": "Asia/Shanghai",
                    }
                ]
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(http_client)
        with pytest.raises(ToolExecutionError, match="location response is invalid"):
            await adapter.get_daily_forecast(make_query())

    assert len(requests) == 1


@pytest.mark.anyio
async def test_open_meteo_maps_empty_daily_forecast_to_domain_error() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "geocoding-api.open-meteo.com":
            return httpx.Response(200, json=GEOCODING_RESPONSE)

        return httpx.Response(
            200,
            json={
                "timezone": "Asia/Shanghai",
                "daily": {
                    "time": [],
                    "temperature_2m_min": [],
                    "temperature_2m_max": [],
                    "precipitation_probability_max": [],
                },
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(http_client)
        with pytest.raises(WeatherDataUnavailableError):
            await adapter.get_daily_forecast(make_query())

    assert len(requests) == 2


@pytest.mark.anyio
async def test_open_meteo_retries_transient_geocoding_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    geocoding_calls = 0
    forecast_calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal geocoding_calls, forecast_calls
        if request.url.host == "geocoding-api.open-meteo.com":
            geocoding_calls += 1
            if geocoding_calls == 1:
                return httpx.Response(503)
            return httpx.Response(200, json=GEOCODING_RESPONSE)

        forecast_calls += 1
        return httpx.Response(200, json=FORECAST_RESPONSE)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(
            http_client,
            retry_base_delay=0.2,
        )
        forecast = await adapter.get_daily_forecast(make_query())

    assert forecast.location.name == "Hangzhou"
    assert geocoding_calls == 2
    assert forecast_calls == 1
    assert sleeps == [0.2]


@pytest.mark.anyio
async def test_open_meteo_retries_transient_forecast_failure_without_repeating_geocoding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    geocoding_calls = 0
    forecast_calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal geocoding_calls, forecast_calls
        if request.url.host == "geocoding-api.open-meteo.com":
            geocoding_calls += 1
            return httpx.Response(200, json=GEOCODING_RESPONSE)

        forecast_calls += 1
        if forecast_calls == 1:
            return httpx.Response(429)
        return httpx.Response(200, json=FORECAST_RESPONSE)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(
            http_client,
            retry_base_delay=0.2,
        )
        forecast = await adapter.get_daily_forecast(make_query())

    assert forecast.location.name == "Hangzhou"
    assert geocoding_calls == 1
    assert forecast_calls == 2
    assert sleeps == [0.2]


@pytest.mark.anyio
async def test_open_meteo_does_not_retry_non_retryable_http_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(http_client)
        with pytest.raises(ToolExecutionError, match="HTTP 400"):
            await adapter.get_daily_forecast(make_query())

    assert calls == 1
    assert sleeps == []


@pytest.mark.anyio
async def test_open_meteo_stops_after_max_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(
            http_client,
            max_attempts=3,
            retry_base_delay=0.2,
        )
        with pytest.raises(ToolExecutionError, match="HTTP 503"):
            await adapter.get_daily_forecast(make_query())

    assert calls == 3
    assert sleeps == [0.2, 0.4]


@pytest.mark.anyio
async def test_open_meteo_maps_repeated_request_timeouts_to_tool_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("timeout", request=request)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(
            http_client,
            max_attempts=3,
            retry_base_delay=0.2,
        )
        with pytest.raises(ToolTimeoutError):
            await adapter.get_daily_forecast(make_query())

    assert calls == 3
    assert sleeps == [0.2, 0.4]


@pytest.mark.anyio
async def test_open_meteo_enforces_wall_clock_timeout_per_get() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=GEOCODING_RESPONSE)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(
            http_client,
            request_timeout=0.001,
            max_attempts=2,
            retry_base_delay=0.001,
        )
        with pytest.raises(ToolTimeoutError):
            await adapter.get_daily_forecast(make_query())

    assert calls == 2


@pytest.mark.anyio
async def test_open_meteo_does_not_retry_invalid_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sleeps: list[float] = []
    calls = 0

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(
        "app.agent.tools.travel.weather.asyncio.sleep",
        fake_sleep,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=b"not-json")

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
    ) as http_client:
        adapter = make_open_meteo_adapter(http_client)
        with pytest.raises(ToolExecutionError, match="invalid JSON"):
            await adapter.get_daily_forecast(make_query())

    assert calls == 1
    assert sleeps == []


@pytest.mark.parametrize(
    ("settings_kwargs", "expected_message"),
    [
        (
            {
                "tool_timeout": 3,
                "tool_request_timeout": 3,
            },
            "tool_timeout must be greater",
        ),
        (
            {
                "tool_timeout": 60,
                "agent_run_timeout": 60,
            },
            "agent_run_timeout must be greater",
        ),
        (
            {
                "tool_timeout": 19,
            },
            "must cover two sequential weather request budgets",
        ),
    ],
)
def test_settings_validate_timeout_layering(
    settings_kwargs: dict[str, float],
    expected_message: str,
) -> None:
    with pytest.raises(ValidationError, match=expected_message):
        Settings.model_validate(settings_kwargs)


def test_default_tool_timeout_covers_two_sequential_retry_paths() -> None:
    settings = Settings.model_validate({})
    retry_wait_seconds = settings.tool_retry_base_delay * (
        2 ** (settings.tool_max_attempts - 1) - 1
    )
    single_phase_budget = (
        settings.tool_request_timeout * settings.tool_max_attempts + retry_wait_seconds
    )

    assert settings.tool_timeout >= single_phase_budget * 2
