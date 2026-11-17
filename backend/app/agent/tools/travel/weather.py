import asyncio
from datetime import UTC, date, datetime
from typing import Any, Protocol, Self

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.agent.contracts import ToolCall, ToolDefinition, ToolResult
from app.agent.tools.error import (
    ToolError,
    ToolExecutionError,
    ToolInvalidArgumentsError,
    ToolTimeoutError,
)

MAX_FORECAST_DAYS = 7
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE_NAME = "open-meteo"


class WeatherQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: str = Field(min_length=1, max_length=199)
    start_date: date
    end_date: date

    @field_validator("destination", mode="before")
    @classmethod
    def normalize_destination(cls, value: str) -> str:
        if isinstance(value, str):
            return " ".join(value.split())
        return value

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        inclusive_days = (self.end_date - self.start_date).days + 1
        if inclusive_days > MAX_FORECAST_DAYS:
            raise ValueError(f"weather range cannot exceed {MAX_FORECAST_DAYS} days")
        return self


class WeatherLocation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    country: str | None = None
    longitude: float
    latitude: float
    timezone: str


class WeatherDay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    temperature_min_c: float
    temperature_max_c: float
    precipitation_probability_max: int | None = None


class WeatherForecast(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location: WeatherLocation
    days: list[WeatherDay] = Field(min_length=1)


class WeatherClient(Protocol):
    async def get_daily_forecast(self, query: WeatherQuery) -> WeatherForecast: ...


class _GeocodingResult(BaseModel):
    name: str
    country: str | None = None
    latitude: float
    longitude: float
    timezone: str | None = None


class _GeocodingResponse(BaseModel):
    results: list[_GeocodingResult] = Field(default_factory=list)


class _OpenMeteoDaily(BaseModel):
    time: list[date]
    temperature_2m_min: list[float]
    temperature_2m_max: list[float]
    precipitation_probability_max: list[int | None] | None = None


class _OpenMeteoForecast(BaseModel):
    timezone: str
    daily: _OpenMeteoDaily


class OpenMeteoWeatherClient:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get_daily_forecast(self, query: WeatherQuery) -> WeatherForecast:
        geocoding_payload = await self._get_json(
            GEOCODING_URL,
            params={
                "name": query.destination,
                "count": 1,
                "language": "zh",
                "format": "json",
            },
        )
        try:
            geocoding = _GeocodingResponse.model_validate(geocoding_payload)
        except ValidationError as exc:
            raise ToolExecutionError("Weather location response is invalid") from exc
        if not geocoding.results:
            raise ToolExecutionError("Weather location was not found")
        location = geocoding.results[0]

        forecast_payload = await self._get_json(
            FORECAST_URL,
            params={
                "latitude": location.latitude,
                "longitude": location.longitude,
                "daily": ("temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
                "timezone": "auto",
                "start_date": query.start_date.isoformat(),
                "end_date": query.end_date.isoformat(),
            },
        )
        try:
            forecast = _OpenMeteoForecast.model_validate(forecast_payload)
        except ValidationError as exc:
            raise ToolExecutionError("Weather forecast response is invalid") from exc
        daily = forecast.daily
        expected_length = len(daily.time)
        precipitation = daily.precipitation_probability_max
        if precipitation is None:
            precipitation = [None] * expected_length
        if not (
            len(daily.temperature_2m_min)
            == len(daily.temperature_2m_max)
            == len(precipitation)
            == expected_length
        ):
            raise ToolExecutionError("Weather forecast series have inconsistent lengths")

        days = [
            WeatherDay(
                date=day,
                temperature_min_c=minimum,
                temperature_max_c=maximum,
                precipitation_probability_max=rain_probability,
            )
            for day, minimum, maximum, rain_probability in zip(
                daily.time,
                daily.temperature_2m_min,
                daily.temperature_2m_max,
                precipitation,
                strict=True,
            )
        ]

        return WeatherForecast(
            location=WeatherLocation(
                name=location.name,
                country=location.country,
                latitude=location.latitude,
                longitude=location.longitude,
                timezone=forecast.timezone,
            ),
            days=days,
        )

    async def _get_json(self, url: str, *, params: dict[str, str | float]) -> dict[str, Any]:
        try:
            response = await self._client.get(url, params=params)
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise ToolTimeoutError("Weather service timed out") from exc
        except httpx.HTTPStatusError as exc:
            raise ToolExecutionError(
                f"Weather service returned HTTP {exc.response.status_code}"
            ) from exc
        except httpx.RequestError as exc:
            raise ToolExecutionError(
                f"Weather service request failed ({type(exc).__name__})"
            ) from exc
        except httpx.HTTPError as exc:
            raise ToolExecutionError("Weather service request failed") from exc

        payload = response.json()
        if not isinstance(payload, dict):
            raise ToolExecutionError("Weather service returned invalid JSON")
        return payload


WEATHER_DEFINITION = ToolDefinition(
    name="get_weather",
    description=(
        "Get a daily weather forecast for a destination and date range. "
        "Use this tool whenever current or forecast weather facts are required."
    ),
    parameters=WeatherQuery.model_json_schema(),
)


class WeatherTool:
    definition = WEATHER_DEFINITION

    def __init__(
        self,
        client: WeatherClient,
        *,
        timeout: float,
    ) -> None:
        self._client = client
        self._timeout = timeout

    async def execute(self, call: ToolCall) -> ToolResult:
        if call.name != self.definition.name:
            raise ToolExecutionError("Tool name does not match weather executor")

        try:
            query = WeatherQuery.model_validate(call.arguments)
        except ValidationError as exc:
            raise ToolInvalidArgumentsError("Weather tool arguments are invalid") from exc

        try:
            async with asyncio.timeout(self._timeout):
                forecast = await self._client.get_daily_forecast(query)
        except TimeoutError as exc:
            raise ToolTimeoutError("Weather tool timed out") from exc
        except ToolError:
            raise
        except Exception as exc:
            raise ToolExecutionError("Weather tool execution failed") from exc

        return ToolResult(
            call_id=call.id,
            name=self.definition.name,
            status="success",
            data=forecast.model_dump(mode="json"),
            source=SOURCE_NAME,
            observed_at=datetime.now(UTC),
        )
