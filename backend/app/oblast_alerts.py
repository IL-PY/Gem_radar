"""Live air-alert levels per oblast, aggregated from the neptun.in.ua public API.

Upstream schema (https://neptun.in.ua/api/v1/alerts):
    {"updatedAt": str, "raions": [...], "oblasts": [...]}
    entry = {"key": str, "name": str, "oblast": str, "since": str,
             "level": "red" | "yellow", "reasons": [...]}

Live alerts arrive per RAION (with an `oblast` field); the `oblasts` array only
carries quasi-static entries (Crimea, Luhansk, Sevastopol). So the oblast level
is derived as the worst level across its raions + direct oblast entries.
City keys ("м. київ", "севастополь") are kept as separate entries so the
frontend can paint Kyiv-city / Sevastopol polygons independently.

Polls via stdlib urllib (no extra dependencies) every POLL_INTERVAL_SEC.
Frontend polls GET /api/oblasts — no websocket plumbing needed.
"""
from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any, Callable, Dict, List, Optional

NEPTUN_URL = "https://neptun.in.ua/api/v1/alerts"
POLL_INTERVAL_SEC = 25
REQUEST_TIMEOUT_SEC = 12

LEVEL_RANK = {"yellow": 1, "red": 2}
VALID_LEVELS = set(LEVEL_RANK.keys())


def _norm(s: Any) -> str:
    return str(s or "").strip().lower()


class OblastAlertsService:
    def __init__(self) -> None:
        self._levels: Dict[str, Dict[str, Any]] = {}
        self._updated_at: float = 0.0
        self._upstream_updated_at: str = ""
        self._error: str = ""
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._subscribers: List[Callable[[dict], None]] = []

    # -- pub/sub (optional; used to push OBLASTS_UPDATED over websocket) --
    def add_subscriber(self, callback: Callable[[dict], None]) -> None:
        self._subscribers.append(callback)

    def _notify(self, snapshot: dict) -> None:
        for sub in self._subscribers:
            try:
                sub(snapshot)
            except Exception as e:
                print(f"[Oblasts] subscriber error: {e}")

    # -- public API --
    def snapshot(self) -> dict:
        return {
            "updated_at": self._updated_at,
            "upstream_updated_at": self._upstream_updated_at,
            "source": NEPTUN_URL,
            "levels": self._levels,
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

    # -- internals --
    async def _poll_loop(self) -> None:
        await self._refresh()  # immediate first fetch, don't wait 25s
        while self._running:
            try:
                await asyncio.sleep(POLL_INTERVAL_SEC)
                if self._running:
                    await self._refresh()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[Oblasts] loop error: {e}")

    async def _refresh(self) -> None:
        try:
            raw = await asyncio.to_thread(self._download)
            data = json.loads(raw)
            levels = self._aggregate(data)
            changed = levels != self._levels
            self._levels = levels
            self._updated_at = time.time()
            self._upstream_updated_at = str(data.get("updatedAt", ""))
            self._error = ""
            if changed:
                self._notify(self.snapshot())
        except asyncio.CancelledError:
            raise
        except Exception as e:
            self._error = str(e)[:200]
            print(f"[Oblasts] refresh failed ({e}), keeping last known levels")

    @staticmethod
    def _download() -> str:
        req = urllib.request.Request(
            NEPTUN_URL,
            headers={"User-Agent": "GemRadar/1.0 (+tactical radar monitor)"},
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
            return resp.read().decode("utf-8")

    @classmethod
    def _aggregate(cls, data: dict) -> Dict[str, Dict[str, Any]]:
        levels: Dict[str, Dict[str, Any]] = {}

        def consider(key: str, level: str, since: str, reasons: Any) -> None:
            key = _norm(key)
            level = _norm(level)
            if not key or level not in VALID_LEVELS:
                return
            if isinstance(reasons, str):
                reasons = [reasons]
            reasons = [str(r) for r in (reasons or [])]
            cur = levels.get(key)
            if cur is None or LEVEL_RANK[level] > LEVEL_RANK[cur["level"]]:
                levels[key] = {"level": level, "since": str(since or ""), "reasons": reasons}
            elif LEVEL_RANK[level] == LEVEL_RANK[cur["level"]]:
                merged = sorted(set(cur.get("reasons", []) + reasons))
                cur["reasons"] = merged
                if since and (not cur.get("since") or since < cur["since"]):
                    cur["since"] = since

        entries: List[dict] = []
        for section in ("raions", "oblasts"):
            items = data.get(section)
            if isinstance(items, list):
                entries.extend([e for e in items if isinstance(e, dict)])

        for e in entries:
            oblast = _norm(e.get("oblast"))
            key = _norm(e.get("key"))
            level = e.get("level")
            since = e.get("since", "")
            reasons = e.get("reasons", [])
            # Aggregate under the oblast name (raions roll up to their oblast)
            if oblast:
                consider(oblast, level, since, reasons)
            # ...and under the entry key itself (covers city keys like
            # "м. київ" / "севастополь" when upstream emits them)
            if key and key != oblast:
                consider(key, level, since, reasons)

        return levels


oblast_alerts = OblastAlertsService()
