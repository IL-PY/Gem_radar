import asyncio
import time
import math
from typing import Dict, List, Optional, Callable, Set
from app.models import RadarTarget, ThreatStatus, ThreatType, GeoPoint, TelegramAlert
from app.geo_database import haversine_distance_km

# Track correlation windows per type (seconds): an update older than this
# starts a fresh track instead of attaching to a stale one.
TRACK_WINDOW_SEC = {
    ThreatType.BALLISTIC: 900,
    ThreatType.CRUISE_MISSILE: 3600,
    ThreatType.SHAHED: 7200,
    ThreatType.JET_SHAHED: 3600,
    ThreatType.KAB: 1500,
    ThreatType.RECON_UAV: 7200,
}

# Threat families for correlation (prop and jet shaheds share one family).
FAMILIES = {
    ThreatType.BALLISTIC: {ThreatType.BALLISTIC},
    ThreatType.SHAHED: {ThreatType.SHAHED, ThreatType.JET_SHAHED},
    ThreatType.JET_SHAHED: {ThreatType.SHAHED, ThreatType.JET_SHAHED},
    ThreatType.CRUISE_MISSILE: {ThreatType.CRUISE_MISSILE},
    ThreatType.KAB: {ThreatType.KAB},
    ThreatType.RECON_UAV: {ThreatType.RECON_UAV},
}


def _norm_channel(ch: str) -> str:
    return (ch or "").strip().lower().lstrip("@")

class TrajectoryEngine:
    def __init__(self):
        self.active_targets: Dict[str, RadarTarget] = {}
        self.recent_alerts: List[TelegramAlert] = []
        self._subscribers: List[Callable[[str, dict], None]] = []
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def add_subscriber(self, callback: Callable[[str, dict], None]):
        self._subscribers.append(callback)

    def remove_subscriber(self, callback: Callable[[str, dict], None]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    def _notify(self, event_type: str, data: dict):
        for sub in self._subscribers:
            try:
                sub(event_type, data)
            except Exception as e:
                print(f"[Engine] Error notifying subscriber: {e}")

    def add_target(self, target: RadarTarget):
        # Defensive copy: engine owns its instance, globals must never be mutated by ticks
        target = target.model_copy(deep=True)
        self.active_targets[target.id] = target
        self._notify("TARGET_SPAWNED", target.model_dump())

    def add_alert(self, alert: TelegramAlert):
        self.recent_alerts.insert(0, alert)
        if len(self.recent_alerts) > 50:
            self.recent_alerts = self.recent_alerts[:50]
        self._notify("ALERT_RECEIVED", alert.model_dump())

    def remove_target(self, target_id: str):
        if target_id in self.active_targets:
            del self.active_targets[target_id]
            self._notify("TARGET_REMOVED", {"id": target_id})

    # ---------------- track correlation (multi-message streams) ----------------
    def family_tracks(self, channel: str, family: Optional[ThreatType], now: float) -> List[RadarTarget]:
        """Live tracks of a channel+family, freshest first."""
        fams = FAMILIES.get(family, {family}) if family is not None else None
        ch = _norm_channel(channel)
        out = []
        for t in self.active_targets.values():
            if _norm_channel(t.source_channel) != ch:
                continue
            if fams is not None and t.threat_type not in fams:
                continue
            window = TRACK_WINDOW_SEC.get(t.threat_type, 3600)
            if (now - t.start_time) > window:
                continue
            out.append(t)
        return sorted(out, key=lambda t: t.start_time, reverse=True)

    def freshest_track(self, channel: str) -> Optional[RadarTarget]:
        ch = _norm_channel(channel)
        cands = [t for t in self.active_targets.values() if _norm_channel(t.source_channel) == ch]
        if not cands:
            return None
        return max(cands, key=lambda t: t.start_time)

    @staticmethod
    def _interp_latlon(target: RadarTarget, now: float):
        total = max(target.eta_seconds, 1.0)
        frac = min(max((now - target.start_time) / total, 0.0), 1.0)
        arc = target.trajectory_arc
        if not arc or len(arc) < 2:
            return target.current_position.lat, target.current_position.lon, frac
        idx = frac * (len(arc) - 1)
        lo = int(math.floor(idx))
        hi = min(lo + 1, len(arc) - 1)
        sub = idx - lo
        lat = arc[lo][0] + (arc[hi][0] - arc[lo][0]) * sub
        lon = arc[lo][1] + (arc[hi][1] - arc[lo][1]) * sub
        return lat, lon, frac

    @staticmethod
    def _arc_dist_km(target: RadarTarget, point: GeoPoint) -> float:
        best = float("inf")
        for pt in target.trajectory_arc:
            ref = GeoPoint(lat=pt[0], lon=pt[1])
            d = haversine_distance_km(ref, point)
            if d < best:
                best = d
        return best

    def find_track(
        self,
        channel: str,
        family: Optional[ThreatType],
        point: Optional[GeoPoint],
        now: float,
        geo_km: float = 80.0,
    ) -> Optional[RadarTarget]:
        """Best live track for an update: same channel+family, fresh, and
        geographically consistent with the reported point (near the arc or
        near the predicted current position)."""
        cands = self.family_tracks(channel, family, now)
        if not cands:
            return None
        if point is None:
            return cands[0]
        scored = []
        for t in cands:
            d_arc = self._arc_dist_km(t, point)
            clat, clon, _ = self._interp_latlon(t, now)
            d_cur = haversine_distance_km(GeoPoint(lat=clat, lon=clon), point)
            if d_arc < geo_km or d_cur < geo_km * 1.5:
                scored.append((min(d_arc, d_cur), -t.start_time, t))
        if not scored:
            return None
        scored.sort(key=lambda s: (s[0], s[1]))
        return scored[0][2]

    def _retime(self, target: RadarTarget, frac: float, now: float) -> None:
        """Shift start_time so the local (frontend) clock matches frac."""
        total = max(target.eta_seconds, 1.0)
        target.start_time = now - frac * total
        target.progress = round(frac, 4)
        target.remaining_seconds = max(0.0, round(total - (now - target.start_time), 1))
        lat, lon, _ = self._interp_latlon(target, now)
        target.current_position.lat = round(lat, 5)
        target.current_position.lon = round(lon, 5)

    def snap_to_point(self, target_id: str, point: GeoPoint, max_jump: float = 0.3) -> Optional[RadarTarget]:
        """Advance a live track to a reported overflight point.

        Never teleports far ahead (capped by max_jump of total path);
        backward corrections are always accepted. Retime keeps the
        frontend's local clock in sync; notifies TARGET_UPDATED.
        """
        t = self.active_targets.get(target_id)
        if not t or not t.trajectory_arc or len(t.trajectory_arc) < 2:
            return None
        now = time.time()
        _, _, cur_frac = self._interp_latlon(t, now)
        best_frac, best_d = cur_frac, float("inf")
        n = len(t.trajectory_arc)
        for i, pt in enumerate(t.trajectory_arc):
            d = haversine_distance_km(GeoPoint(lat=pt[0], lon=pt[1]), point)
            if d < best_d:
                best_d, best_frac = d, i / (n - 1)
        if best_frac < cur_frac:
            new_frac = best_frac  # correction backwards: accept
        else:
            new_frac = min(best_frac, cur_frac + max_jump)
        self._retime(t, new_frac, now)
        # Heading from local segment
        idx = min(int(math.floor(new_frac * (n - 1))), n - 2)
        d_lat = t.trajectory_arc[idx + 1][0] - t.trajectory_arc[idx][0]
        d_lon = t.trajectory_arc[idx + 1][1] - t.trajectory_arc[idx][1]
        if abs(d_lat) > 1e-9 or abs(d_lon) > 1e-9:
            t.bearing = round((math.degrees(math.atan2(d_lon, d_lat)) + 360) % 360, 1)
        self._notify("TARGET_UPDATED", t.model_dump())
        return t

    def mark_approaching(self, target_id: str) -> Optional[RadarTarget]:
        """Terminal phase ('спуск'): status APPROACHING, at least 80% along."""
        t = self.active_targets.get(target_id)
        if not t:
            return None
        now = time.time()
        _, _, cur_frac = self._interp_latlon(t, now)
        self._retime(t, max(cur_frac, 0.8), now)
        t.status = ThreatStatus.APPROACHING
        self._notify("TARGET_UPDATED", t.model_dump())
        return t

    def remove_family(self, channel: str, family: Optional[ThreatType]) -> List[str]:
        """Purge a channel's live tracks of a family (all-clear)."""
        fams = FAMILIES.get(family, {family}) if family is not None else None
        ch = _norm_channel(channel)
        removed = []
        for tid, t in list(self.active_targets.items()):
            if _norm_channel(t.source_channel) != ch:
                continue
            if fams is not None and t.threat_type not in fams:
                continue
            del self.active_targets[tid]
            self._notify("TARGET_REMOVED", {"id": tid})
            removed.append(tid)
        return removed

    def get_snapshot(self) -> dict:
        return {
            "targets": [t.model_dump() for t in self.active_targets.values()],
            "alerts": [a.model_dump() for a in self.recent_alerts],
            "timestamp": time.time(),
        }

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._simulation_loop())

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _simulation_loop(self):
        """High-frequency continuous physics engine update."""
        while self._running:
            try:
                self.update_physics_tick()
            except Exception as e:
                print(f"[Engine] Tick error: {e}")
            await asyncio.sleep(0.5)

    def update_physics_tick(self):
        now = time.time()
        targets_to_delete = []

        for tid, target in list(self.active_targets.items()):
            elapsed = now - target.start_time
            total_duration = max(target.eta_seconds, 1.0)
            progress = min(max(elapsed / total_duration, 0.0), 1.0)
            target.progress = round(progress, 4)
            target.remaining_seconds = max(0.0, round(total_duration - elapsed, 1))

            # Interpolate position along curved trajectory arc
            arc = target.trajectory_arc
            if arc and len(arc) >= 2:
                idx_float = progress * (len(arc) - 1)
                idx_low = int(math.floor(idx_float))
                idx_high = min(idx_low + 1, len(arc) - 1)
                t_sub = idx_float - idx_low

                p1 = arc[idx_low]
                p2 = arc[idx_high]

                curr_lat = p1[0] + (p2[0] - p1[0]) * t_sub
                curr_lon = p1[1] + (p2[1] - p1[1]) * t_sub

                target.current_position.lat = round(curr_lat, 5)
                target.current_position.lon = round(curr_lon, 5)

                # Segment tangent bearing for heading direction
                d_lat = p2[0] - p1[0]
                d_lon = p2[1] - p1[1]
                if abs(d_lat) > 1e-6 or abs(d_lon) > 1e-6:
                    angle = math.degrees(math.atan2(d_lon, d_lat))
                    target.bearing = round((angle + 360) % 360, 1)

            # State transitions
            if progress >= 1.0:
                if target.status == ThreatStatus.IN_FLIGHT:
                    target.status = ThreatStatus.IMPACTED
                # Grace period: keep on radar for 60 seconds after impact/arrival
                if elapsed > (target.eta_seconds + 60.0):
                    targets_to_delete.append(tid)

        for tid in targets_to_delete:
            self.remove_target(tid)

engine = TrajectoryEngine()
