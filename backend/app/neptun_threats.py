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
import math
import time
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

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

# -----------------------------------------------------------------------
# Large Ukrainian cities (pop > ~200 k) used for destination estimation.
# -----------------------------------------------------------------------
LARGE_CITIES: List[Tuple[float, float, str]] = [
    (50.4501, 30.5234, "Київ"),
    (49.9935, 36.2304, "Харків"),
    (46.4825, 30.7233, "Одеса"),
    (48.4647, 35.0462, "Дніпро"),
    (47.8388, 35.1396, "Запоріжжя"),
    (49.8397, 24.0297, "Львів"),
    (47.9105, 33.3918, "Кривий Ріг"),
    (46.9750, 31.9946, "Миколаїв"),
    (49.2331, 28.4682, "Вінниця"),
    (50.2547, 28.6587, "Житомир"),
    (51.4982, 31.2893, "Чернігів"),
    (49.4444, 32.0598, "Черкаси"),
    (49.5883, 34.5514, "Полтава"),
    (50.9077, 34.7981, "Суми"),
    (50.6199, 26.2516, "Рівне"),
    (50.7472, 25.3254, "Луцьк"),
    (49.4230, 26.9871, "Хмельницький"),
    (49.5535, 25.5948, "Тернопіль"),
    (48.9226, 24.7111, "Івано-Франківськ"),
    (48.2917, 25.9354, "Чернівці"),
    (48.5079, 32.2623, "Кропивницький"),
    (49.0700, 33.4200, "Кременчук"),
]

# How far back (km) to extrapolate the launch point per threat type.
LAUNCH_BACK_KM: Dict[str, float] = {
    "uav": 120.0,       # Shahed launched ~100-150 km inside Russia
    "fpv": 40.0,        # FPV range ~5-20 km; fallback 40 km
    "recon": 80.0,
    "missile": 250.0,   # Cruise missile (Kh-101, Kalibr)
    "ballistic": 350.0, # Iskander/KN-23
    "kab": 60.0,        # KAB dropped from Su-35 ~40-80 km back
    "mig31k": 500.0,    # MiG-31K/Kinzhal launched 400-700 km away
    "unknown": 150.0,
}

# Dense ground-track resolution so NEPTUN arcs render exactly like the
# simulator (curved ballistic sweep / S-weave for drones), not a 3-point
# kink. The frontend adds the vertical lift on top (same altitude model).
TRAJECTORY_POINTS = 48


def _bezier_leg(
    lat0: float, lon0: float, lat1: float, lon1: float,
    n: int, amplitude: float,
) -> List[Tuple[float, float]]:
    """One quadratic-Bezier leg (ballistic ground-track curvature).

    Same shape as geo_database.generate_curved_ballistic_arc, but for an
    arbitrary leg so launch -> current -> dest stays continuous through
    the observed position.
    """
    d_lat, d_lon = lat1 - lat0, lon1 - lon0
    norm_len = math.hypot(-d_lon, d_lat)
    if norm_len > 0:
        n_lat, n_lon = -d_lon / norm_len, d_lat / norm_len
    else:
        n_lat, n_lon = 0.0, 0.0
    if n_lat < 0:
        n_lat, n_lon = -n_lat, -n_lon
    mid_lat = (lat0 + lat1) / 2 + n_lat * amplitude
    mid_lon = (lon0 + lon1) / 2 + n_lon * amplitude
    pts: List[Tuple[float, float]] = []
    for i in range(n):
        t = i / float(max(n - 1, 1))
        b_lat = (1 - t) ** 2 * lat0 + 2 * (1 - t) * t * mid_lat + t ** 2 * lat1
        b_lon = (1 - t) ** 2 * lon0 + 2 * (1 - t) * t * mid_lon + t ** 2 * lon1
        pts.append((b_lat, b_lon))
    return pts


def _weave_leg(
    lat0: float, lon0: float, lat1: float, lon1: float,
    n: int, weave_deg: float, weave_cycles: float, phase: float = 0.0,
) -> List[Tuple[float, float]]:
    """One linear leg with sinusoidal lateral S-weave (drones / cruise)."""
    d_lat, d_lon = lat1 - lat0, lon1 - lon0
    norm_len = math.hypot(d_lat, d_lon)
    if norm_len > 0:
        n_lat, n_lon = -d_lon / norm_len, d_lat / norm_len
    else:
        n_lat, n_lon = 0.0, 0.0
    pts: List[Tuple[float, float]] = []
    for i in range(n):
        t = i / float(max(n - 1, 1))
        lat = lat0 + (lat1 - lat0) * t
        lon = lon0 + (lon1 - lon0) * t
        if weave_deg > 0:
            w = weave_deg * math.sin(2.0 * math.pi * weave_cycles * t + phase)
            lat += n_lat * w
            lon += n_lon * w
        pts.append((lat, lon))
    return pts


def _scaled_weave(
    weave_deg: float, weave_cycles: float,
    lat0: float, lon0: float, lat1: float, lon1: float,
) -> Tuple[float, float]:
    """Scale the S-weave to the leg length.

    A fixed cycle count looks gentle on a 300 km leg but draws wild loops
    on a 40 km final leg into the target. One full swing per ~150 km and
    lateral amplitude capped at ~6% of the leg length instead.
    """
    leg_km = _haversine(lat0, lon0, lat1, lon1)
    deg_len = math.hypot(lat1 - lat0, lon1 - lon0)
    cycles = min(weave_cycles, max(0.6, leg_km / 150.0))
    amp = min(weave_deg, deg_len * 0.06)
    return amp, cycles


def build_forward_trajectory(
    current: Tuple[float, float],
    dest: Tuple[float, float],
    family: str,
    speed_kmh: Optional[float] = None,
    full_dist_km: float = 0.0,
    num_points: int = TRAJECTORY_POINTS + 1,
) -> List[List[float]]:
    """Dense A -> B ground track in the direction of flight.

    Used for both the expected path (live fix -> dest) and the flown
    history (launch -> live fix). Shape mirrors the simulator: ballistic
    Bezier sweep for BALLISTIC / MIG31K, short straight glide for KAB,
    S-weave for SHAHED / cruise / recon.
    """
    n = max(num_points, 2)
    c_lat, c_lon = current
    d_lat, d_lon = dest
    fam = (family or "").upper()
    is_jet = fam == "SHAHED" and speed_kmh is not None and speed_kmh >= 400
    if fam in ("BALLISTIC", "MIG31K"):
        amplitude = min(max(max(full_dist_km, 1.0) * 0.0035, 0.4), 1.8)
        leg = _bezier_leg(c_lat, c_lon, d_lat, d_lon, n, amplitude)
    elif fam == "KAB":
        leg = _weave_leg(c_lat, c_lon, d_lat, d_lon, n, 0.0, 0.0)
    else:
        if is_jet or fam == "JET_SHAHED":
            weave, cycles = 0.04, 1.2
        elif fam == "CRUISE_MISSILE":
            weave, cycles = 0.035, 1.5
        elif fam in ("SHAHED", "FPV"):
            weave, cycles = 0.09, 2.5
        else:
            weave, cycles = 0.05, 2.0
        weave, cycles = _scaled_weave(weave, cycles, c_lat, c_lon, d_lat, d_lon)
        leg = _weave_leg(c_lat, c_lon, d_lat, d_lon, n, weave, cycles)

    return [[round(la, 5), round(lo, 5)] for la, lo in leg]


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    la1, la2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(la2)
    y = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _dest_point(lat: float, lon: float, bearing_deg: float, km: float) -> Tuple[float, float]:
    R = 6371.0
    br = math.radians(bearing_deg)
    la1, lo1 = math.radians(lat), math.radians(lon)
    la2 = math.asin(math.sin(la1) * math.cos(km / R) + math.cos(la1) * math.sin(km / R) * math.cos(br))
    lo2 = lo1 + math.atan2(
        math.sin(br) * math.sin(km / R) * math.cos(la1),
        math.cos(km / R) - math.sin(la1) * math.sin(la2),
    )
    return math.degrees(la2), math.degrees(lo2)


# Known tactical launch bases and border launch areas for Russia / occupied territories
KNOWN_LAUNCH_AREAS: List[Tuple[float, float, str]] = [
    (50.5954, 36.5873, "Бєлгородська обл"),
    (51.7303, 36.1926, "Курська обл"),
    (52.7539, 32.2345, "Брянська обл (Клинці)"),
    (51.6720, 39.1843, "Воронезька обл"),
    (54.7826, 32.0453, "Смоленська обл"),
    (45.0069, 35.8394, "Крим (Чауда)"),
    (46.7128, 38.2741, "Єйськ"),
    (46.0464, 38.1747, "Приморсько-Ахтарськ"),
    (47.2362, 38.8969, "Таганрог / Ростов"),
    (44.1500, 34.5000, "Чорне море (Калібри)"),
]


def estimate_launch_point(
    lat: float, lon: float, bearing_deg: float, ntype: str, title: str = "", region: str = ""
) -> Tuple[float, float, str]:
    """Extrapolate backwards along heading or match known launch origin (Belgorod, Kursk, Bryansk, etc.).

    Returns (launch_lat, launch_lon, origin_name).
    """
    text_ctx = f"{title} {region}".lower()
    for olat, olon, oname in KNOWN_LAUNCH_AREAS:
        if oname.lower() in text_ctx or oname.split()[0].lower() in text_ctx:
            return olat, olon, oname

    # For ballistic or missiles, see if back-extrapolated vector passes near known launch hubs
    back_km = LAUNCH_BACK_KM.get(ntype, 150.0)
    raw_back_lat, raw_back_lon = _dest_point(lat, lon, (bearing_deg + 180.0) % 360.0, back_km)

    # Check if back point is within 120km of a known border launch hub (e.g. Kursk, Belgorod, Bryansk)
    best_known: Optional[Tuple[float, float, float, str]] = None
    for olat, olon, oname in KNOWN_LAUNCH_AREAS:
        d = _haversine(raw_back_lat, raw_back_lon, olat, olon)
        if d < 140.0:
            if best_known is None or d < best_known[0]:
                best_known = (d, olat, olon, oname)

    if best_known:
        return best_known[1], best_known[2], best_known[3]

    return round(raw_back_lat, 5), round(raw_back_lon, 5), "Орієнтовний район пуску"


def find_nearest_large_city_in_direction(
    lat: float, lon: float, bearing_deg: float, angle_tolerance_deg: float = 70.0
) -> Optional[Tuple[float, float, str]]:
    """Nearest large Ukrainian city roughly in the direction of travel.

    Filters to ±angle_tolerance_deg of heading, returns closest in sector.
    Falls back to globally nearest city when nothing is in sector.
    """
    best: Optional[Tuple[float, float, float, str]] = None  # (dist, lat, lon, name)
    for clat, clon, cname in LARGE_CITIES:
        dist = _haversine(lat, lon, clat, clon)
        to_city = _bearing(lat, lon, clat, clon)
        angle_diff = abs(((to_city - bearing_deg + 180) % 360) - 180)
        if angle_diff <= angle_tolerance_deg:
            if best is None or dist < best[0]:
                best = (dist, clat, clon, cname)
    if best:
        return best[1], best[2], best[3]
    # Fallback: globally nearest
    fb: Optional[Tuple[float, float, float, str]] = None
    for clat, clon, cname in LARGE_CITIES:
        dist = _haversine(lat, lon, clat, clon)
        if fb is None or dist < fb[0]:
            fb = (dist, clat, clon, cname)
    return (fb[1], fb[2], fb[3]) if fb else None

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
            effective_bearing = bearing
            if effective_bearing is None:
                try:
                    effective_bearing = float(t.get("heading")) if t.get("heading") is not None else None
                except (TypeError, ValueError):
                    effective_bearing = None

            launch_info: Optional[Dict[str, Any]] = None
            dest_info: Optional[Dict[str, Any]] = None
            expected_trajectory: List[List[float]] = []

            if effective_bearing is not None:
                # 1. Estimate launch origin
                l_lat, l_lon, l_name = estimate_launch_point(
                    lat_f, lon_f, effective_bearing, ntype,
                    title=str(t.get("title", "")),
                    region=str(t.get("region", ""))
                )
                launch_info = {
                    "lat": round(l_lat, 5),
                    "lon": round(l_lon, 5),
                    "name": l_name,
                }

                # 2. Estimate destination large city
                d_res = find_nearest_large_city_in_direction(lat_f, lon_f, effective_bearing)
                if d_res:
                    d_lat, d_lon, d_name = d_res
                    dest_info = {
                        "lat": round(d_lat, 5),
                        "lon": round(d_lon, 5),
                        "name": d_name,
                    }
                else:
                    # Extrapolate forward ~80km if no city matched
                    f_lat, f_lon = _dest_point(lat_f, lon_f, effective_bearing, 80.0)
                    d_lat, d_lon, d_name = f_lat, f_lon, "Очікуваний сектор"
                    dest_info = {
                        "lat": round(f_lat, 5),
                        "lon": round(f_lon, 5),
                        "name": d_name,
                    }
                # 3. Dense forward track (live fix -> dest) + flown fraction
                # for the frontend altitude profile. Plus the flown history
                # (launch -> live fix) drawn solid in the same color.
                flown_km = _haversine(l_lat, l_lon, lat_f, lon_f)
                remain_km = _haversine(lat_f, lon_f, d_lat, d_lon)
                full_km = flown_km + remain_km
                progress_base = (flown_km / full_km) if full_km > 0 else 0.0
                family = TYPE_MAP.get(ntype, "UNKNOWN")
                expected_trajectory = build_forward_trajectory(
                    (lat_f, lon_f), (d_lat, d_lon),
                    family, speed, full_km,
                )
                flown_trajectory = build_forward_trajectory(
                    (l_lat, l_lon), (lat_f, lon_f),
                    family, speed, full_km,
                    num_points=TRAJECTORY_POINTS // 2 + 1,
                )

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
                "launch": launch_info,
                "destination": dest_info,
                "expectedTrajectory": expected_trajectory,
                "flownTrajectory": flown_trajectory if effective_bearing is not None else [],
                "progressBase": round(progress_base, 4) if effective_bearing is not None else None,
            })
        return out


neptun_threats = NeptunThreatsService()
