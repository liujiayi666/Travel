from __future__ import annotations

import json
from http.client import HTTPException
from urllib.request import urlopen

HEALTH_URL = "http://127.0.0.1:8000/api/healthz"


def main() -> int:
    try:
        with urlopen(HEALTH_URL, timeout=2) as response:
            payload = json.load(response)
    except (OSError, ValueError, HTTPException):
        return 1

    if not isinstance(payload, dict):
        return 1

    is_ready = payload.get("status") == "ok" and payload.get("database") == "connected"
    return 0 if is_ready else 1


raise SystemExit(main())
