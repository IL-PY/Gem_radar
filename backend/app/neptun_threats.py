"""Live threat tracks from the public NEPTUN API (https://neptun.in.ua/developers).

Uses GET /api/v1/threats (snapshot of active threats with lat/lon/heading/
velocity). Polled every POLL_INTERVAL_SEC (docs ask not more often than 5 s).
Read-only, no keys, CORS-open upstream — fetched server-side to keep one
integration point and to normalize types for the frontend.

Attribution (required by NEPTUN terms) is rendered by the frontend next
to the map legend.
"""
from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any, Dict, List, Optional

NEPTUN_THREATS_URL = "https://neptun.in.ua/api/v1/threats"
POLL_INTERVAL_SEC = 10
REQUEST_TIMEOUT_SEC = 12

# neptun type -> our display family (frontend skins by the same key)
TYPE_MAP = {
    "uav": "SHAHED",
    "fpv": "FPV",
    "recon": "RECON_UAV",
    "missile": "CRUISE_MISSILE",
    "ballistic": "BALLISTIC",
    "kab": "KAB",
    "mig31k": "MIG31K",
    "unknown": "UNKNOWN",
}

VALID_STATUSES = {"active", "stale"}


class NeptunThreatsService:
    def __init__(self) -> None:
        self._threats: List[Dict[str, Any]] = []
        self._updated_at: float = 0.0
        self._server_time: str = ""
        self._error: str = ""
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def snapshot(self) -> dict:
        return {
            "updated_at": self._updated_at,
            "server_time": self._server_time,
            "source": NEPTUN_THREATS_URL,
            "threats": self._threats,
            "error": self._error,
        }

    def start(self) -> None:
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._poll_loop())

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None

    async def _poll_loop(self) -> None:
        await self._refresh()
        while self._running:
            try:
                await asyncio.sleep(POLL_INTERVAL_SEC)
                if self._running:
                    await self._refresh()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[NeptunThreats] loop error: {e}")

    async def _refresh(self) -> None:
        try:
            raw = await asyncio.to_thread(self._download)
            data = json.loads(raw)
            threats = self._normalize(data)
            self._threats = threats
            self._updated_at = time.time()
            self._server_time = str(data.get("serverTime", ""))
            self._error = ""
        except asyncio.CancelledError:
            raise
        except Exception as e:
            self._error = str(e)[:200]
            print(f"[NeptunThreats] refresh failed ({e}), keeping last snapshot")

    @staticmethod
    def _download() -> str:
        req = urllib.request.Request(
            NEPTUN_THREATS_URL,
            headers={"User-Agent": "GemRadar/1.0 (+tactical radar monitor)"},
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
            return resp.read().decode("utf-8")

    @classmethod
    def _normalize(cls, data: dict) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        items = data.get("threats")
        if not isinstance(items, list):
            return out
        for t in items:
            if not isinstance(t, dict):
                continue
            status = str(t.get("status", "active")).lower()
            if status not in VALID_STATUSES:
                continue  # drop resolved
            lat, lon = t.get("lat"), t.get("lon")
            try:
                lat_f, lon_f = float(lat), float(lon)
            except (TypeError, ValueError):
                continue
            vel = t.get("velocity") or {}
            try:
                speed = float(vel.get("speedKmh")) if vel.get("speedKmh") is not None else None
            except (TypeError, ValueError):
                speed = None
            try:
                bearing = float(vel.get("bearingDeg")) if vel.get("bearingDeg") is not None else None
            except (TypeError, ValueError):
                bearing = None
            ntype = str(t.get("type", "unknown")).lower()
            try:
                count = int(t.get("count") or 0)
            except (TypeError, ValueError):
                count = 0
            out.append({
                "id": str(t.get("id", "")),
                "ntype": ntype,
                "family": TYPE_MAP.get(ntype, "UNKNOWN"),
                "title": str(t.get("title", "")),
                "region": str(t.get("region", "")),
                "district": str(t.get("district", "")),
                "locality": str(t.get("locality", "")),
                "lat": lat_f,
                "lon": lon_f,
                "heading": t.get("heading"),
                "confidence": str(t.get("confidenceLevel", "")),
                "sourceCount": t.get("sourceCount", 0),
                "count": count,
                "status": status,
                "updatedAt": str(t.get("updatedAt", "")),
                "confirmedAt": str(t.get("confirmedAt", "")),
                "speedKmh": speed,
                "bearingDeg": bearing,
                "uncertaintyKm": t.get("uncertaintyKm"),
                "advisory": bool(t.get("advisory", False)),
                "areaOnly": bool(t.get("areaOnly", False)),
                "explanation": str(t.get("explanationShort", "")),
                "trail": t.get("trail", []),
            })
        return out


neptun_threats = NeptunThreatsService()
