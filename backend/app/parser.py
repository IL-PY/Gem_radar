import re
import uuid
import time
from typing import Optional, Tuple, List, Dict, Any
from app.models import ThreatType, ThreatStatus, RadarTarget, GeoPoint
from app.geo_database import (
    UKRAINE_GEO,
    find_geo_location,
    find_district,
    find_launch_origin,
    generate_curved_ballistic_arc,
    generate_linear_waypoints,
    haversine_distance_km,
    calculate_bearing,
)

class ThreatParser:
    # Regex patterns for threat classification (including tactical and monitor slang)
    RE_BALLISTIC = re.compile(
        r"(іскандер(?:-м|-к)?|искандер(?:-м|-к)?|кинджал|кинжал|балістик|баллистик|швидкісна ціль|скоростная цель|kn-23|кн-23|с-300|с-400|s-300|s-400|отрк|міг-31к|миг-31к|х-47м2|циркон|точка-у)",
        re.IGNORECASE,
    )
    RE_SHAHED = re.compile(
        r"(шахед|шахід|геран|бпла|мопед|дрон|блядин|гербер|пароді|shahed|рій дронів|табун)",
        re.IGNORECASE,
    )
    # Jet-powered Shaheds (Shahed-238 / Герань-3). MUST be checked BEFORE
    # RE_SHAHED because such messages also contain "шахед"/"герань"/"бпла".
    RE_JET_SHAHED = re.compile(
        r"(реактивн|shahed[-\s]?238|герань[-\s]?3|geran[-\s]?3|jet[-\s]?(?:shahed|дрон|шахед)|джет|реактивный)",
        re.IGNORECASE,
    )
    RE_CRUISE = re.compile(
        r"(х-101|х-555|х-55|х-59|х-69|х-22|х-32|калібр|калибр|крилат[а-я]* ракет|крылат[а-я]* ракет|крмб|ракета\b|ракети\b|стратеги|ту-95)",
        re.IGNORECASE,
    )
    RE_KAB = re.compile(
        r"(каб|фаб|умпк|умпб|керован[а-я]* авіабомб|управля[а-я]* авиабомб|одаб|бомб[а-я]* з та)",
        re.IGNORECASE,
    )

    # Keywords for destination extraction
    RE_DESTINATION = re.compile(
        r"(?:курсом\s+на|в\s+напрямку|напрямком\s+на|вектор(?:ом)?\s+на|ціль\s+на|на|летить\s+на|рухається\s+на)\s+([а-яіїєґa-z\s\-]+)",
        re.IGNORECASE,
    )
    # Terse vector/direction updates without "на": "Вектор Оболонь", "далі Київ", "~Нивки"
    RE_VECTOR = re.compile(
        r"(?:вектор|далі|далее)\s+~?([а-яіїєґa-z\-]+)",
        re.IGNORECASE,
    )
    # Overflown point: "1х повз Глухів", "мимо Ніжина"
    RE_PAST = re.compile(
        r"(?:повз|мимо|біля|около|поблизу)\s+~?([а-яіїєґa-z\-]+)",
        re.IGNORECASE,
    )

    # Keywords for origin extraction
    RE_ORIGIN = re.compile(
        r"(?:з\s+району|із\s+району|з\s+боку|пуск\s+з|пуски\s+з|з|із)\s+([а-яіїєґa-z\s\-]+)",
        re.IGNORECASE,
    )

    # Keywords for resolution / neutralization (note both RU "минус" and UA "мінус")
    RE_INTERCEPTED = re.compile(r"(збито|знищено|перехоплено|минус|мінус|збили|сбит|уничтожен)", re.IGNORECASE)
    RE_LOST = re.compile(r"(локаційно\s+втрачено|припинила\s+існування|впав|не\s+фіксується)", re.IGNORECASE)
    RE_ALL_CLEAR = re.compile(r"(відбій|чисто|загроза\s+минула|дорозвідка|отбой)", re.IGNORECASE)

    # ---- Message-stream taxonomy (monitor channels post tracks, not single shots) ----
    # Launch facts: "Вихід Циркону Курськ", "Пуск балістики з Брянська"
    RE_LAUNCH = re.compile(r"(вихід|выход|пуск|пуски|старт|запуск)", re.IGNORECASE)
    # Position updates: "1х повз Глухів", "далі Чернігівщина", "Вектор Оболонь", "~Нивки"
    RE_UPDATE = re.compile(r"(повз|мимо|далі|далее|вектор|біля|около)", re.IGNORECASE)
    # Terminal phase: "спуск балістики", "заходить на ціль"
    RE_TERMINAL = re.compile(r"(спуск|снижение|пікіру|заход(?:ить|ження|ит)?\s+на|снижается)", re.IGNORECASE)
    # Impact reports: "Вибухи у Києві", "приліт", "💥"
    RE_IMPACT = re.compile(r"(вибух|взрыв|приліт|прилет|попадан|💥)", re.IGNORECASE)
    # Uncertainty markers: "Імовірний пуск ... або робота ППО"
    RE_UNCERTAIN = re.compile(r"(імовірн|ймовірн|вероятн|можлив|можливо|\?|не\s+підтверджено|схоже\s+на|попередньо)", re.IGNORECASE)
    # Unit count: "1х", "2х"
    RE_COUNT = re.compile(r"(\d+)\s*[хx]\b", re.IGNORECASE)
    # Ordinal count: "Третя" (= 3rd unit inbound), "друга", ...
    RE_ORDINAL = re.compile(r"\b(перш|друг|трет|четверт|пʼят|пят|сьом|восьм|шост)\w*", re.IGNORECASE)
    ORDINAL_NUM = {"перш": 1, "друг": 2, "трет": 3, "четверт": 4, "пʼят": 5, "пят": 5, "шост": 6, "сьом": 7, "восьм": 8}

    @classmethod
    def identify_threat_type(cls, text: str) -> Optional[ThreatType]:
        text_lower = text.lower()
        if cls.RE_BALLISTIC.search(text_lower):
            return ThreatType.BALLISTIC
        if cls.RE_JET_SHAHED.search(text_lower):
            return ThreatType.JET_SHAHED
        if cls.RE_SHAHED.search(text_lower):
            return ThreatType.SHAHED
        if cls.RE_CRUISE.search(text_lower):
            return ThreatType.CRUISE_MISSILE
        if cls.RE_KAB.search(text_lower):
            return ThreatType.KAB
        return None

    @classmethod
    def _ballistic_params(cls, text: str) -> Tuple[float, str]:
        """Per-system speed/name. Priority: Kinzhal > Zircon > Iskander >
        S-300/400 — a message may name several ('Іскандер / С-400 ...
        або робота ППО'), the striking system wins over the AD mention."""
        tl = text.lower()
        if "кинджал" in tl or "кинжал" in tl or "х-47м2" in tl or "міг-31к" in tl or "миг-31к" in tl:
            return 11500.0, "Кинджал (Х-47М2)"
        if "циркон" in tl:
            return 9500.0, "Циркон (3М22)"
        if "іскандер" in tl or "искандер" in tl or "kn-23" in tl or "кн-23" in tl or "отрк" in tl:
            return 7200.0, "Іскандер-М / Балістика"
        if "с-300" in tl or "с-400" in tl or "s-300" in tl or "s-400" in tl:
            return 3600.0, "С-300/С-400 (режим земля-земля)"
        return 7200.0, "Іскандер-М / Балістика"  # ~2000 m/s (Mach 6)

    @classmethod
    def extract_count(cls, text: str) -> int:
        """Unit count from '2х' or ordinals ('Третя' -> 3). Default 1."""
        m = cls.RE_COUNT.search(text)
        if m:
            try:
                return max(1, min(int(m.group(1)), 20))
            except ValueError:
                pass
        m = cls.RE_ORDINAL.search(text.lower())
        if m:
            return cls.ORDINAL_NUM.get(m.group(1).lower(), 1)
        return 1

    @classmethod
    def extract_point(cls, text: str) -> Optional[GeoPoint]:
        """Overflown / referenced point: 'повз Глухів', '~Нивки'."""
        m = cls.RE_PAST.search(text)
        if m:
            chunk = m.group(1).lstrip("~")
            pt = find_geo_location(chunk) or find_district(chunk)
            if pt:
                return pt
        # Bare "~Place" vector without keywords
        m = re.search(r"~\s*([а-яіїєґa-z\-]+)", text)
        if m:
            chunk = m.group(1)
            pt = find_geo_location(chunk) or find_district(chunk)
            if pt:
                return pt
        return None

    @classmethod
    def classify_message(cls, text: str) -> Dict[str, Any]:
        """Classify a monitor-channel message into a stream event.

        Kinds: ALL_CLEAR, INTERCEPTED, IMPACT, TERMINAL, LAUNCH, UPDATE,
        ANNOUNCE, NOISE. Order matters: 'Відбій загрози балістики' must NOT
        be treated as a launch just because it names ballistics.
        """
        tl = text.lower()
        family = cls.identify_threat_type(text)
        count = cls.extract_count(text)
        uncertain = bool(cls.RE_UNCERTAIN.search(text))

        if cls.RE_ALL_CLEAR.search(tl):
            return {"kind": "ALL_CLEAR", "family": family, "count": 0, "uncertain": False}
        if cls.RE_INTERCEPTED.search(tl) or cls.RE_LOST.search(tl):
            return {"kind": "INTERCEPTED", "family": family, "count": count, "uncertain": False}
        if cls.RE_IMPACT.search(tl):
            return {"kind": "IMPACT", "family": family, "count": count, "uncertain": False}
        if cls.RE_TERMINAL.search(tl):
            return {"kind": "TERMINAL", "family": family, "count": count, "uncertain": uncertain}
        if cls.RE_LAUNCH.search(tl):
            return {"kind": "LAUNCH", "family": family, "count": count, "uncertain": uncertain}
        if cls.RE_UPDATE.search(tl) or "~" in text or count > 1:
            return {"kind": "UPDATE", "family": family, "count": count, "uncertain": uncertain}
        if family:
            return {"kind": "ANNOUNCE", "family": family, "count": count, "uncertain": uncertain}
        return {"kind": "NOISE", "family": None, "count": 0, "uncertain": False}

    @classmethod
    def process_message(cls, text: str, channel: str = "Telegram") -> Dict[str, Any]:
        """Stateful stream processor: correlates a message with live tracks.

        Returns {"action", "family", "primary": RadarTarget|None,
                 "added": [...], "removed": [...]} and mutates the engine:
        - UPDATE/TERMINAL attach to the matching live track (snap progress),
          spawning only when nothing matches;
        - INTERCEPTED/IMPACT resolve (remove) the matching track;
        - ALL_CLEAR purges the family's tracks;
        - "Третя"/"2х" style counts top up the number of live tracks.
        """
        from app.trajectory_engine import engine

        cls_info = cls.classify_message(text)
        kind = cls_info["kind"]
        family = cls_info["family"]
        count = cls_info["count"] or 1
        now = time.time()

        result: Dict[str, Any] = {
            "action": kind.lower(), "family": family,
            "primary": None, "added": [], "removed": [],
        }

        # Resolve family for bare updates ("Вектор Оболонь"): inherit the
        # channel's live track family, else assume ballistic with low confidence.
        low_confidence = False
        if family is None and kind in ("UPDATE", "TERMINAL", "LAUNCH"):
            fallback = engine.freshest_track(channel)
            if fallback:
                family = fallback.threat_type
                result["family"] = family
            else:
                family = ThreatType.BALLISTIC
                result["family"] = family
                low_confidence = True

        if kind in ("NOISE",):
            return result

        if kind == "ALL_CLEAR":
            removed = engine.remove_family(channel, family)
            result["removed"] = removed
            result["action"] = "all_clear"
            return result

        if kind in ("INTERCEPTED", "IMPACT"):
            point = cls.extract_point(text) or cls._dest_guess(text, family)
            target = engine.find_track(channel, family, point, now)
            if target is None and family is None:
                target = engine.freshest_track(channel)
            if target:
                engine.remove_target(target.id)
                result["removed"] = [target.id]
                result["primary"] = target
                result["action"] = "intercepted" if kind == "INTERCEPTED" else "impact"
            return result

        # --- LAUNCH / ANNOUNCE / UPDATE / TERMINAL: attach or spawn ---
        point = cls.extract_point(text)
        dest = cls._dest_guess(text, family)
        # "далі X" places are waypoints, not final destinations: treat as points.
        if point is None and dest is not None and kind == "UPDATE":
            point = dest

        target = engine.find_track(channel, family, point or dest, now)
        if target is None:
            assert family is not None
            spawn_text = text
            target = cls.parse_message(spawn_text, channel=channel, force_type=family)
            if target is None:
                return result
            if low_confidence or cls_info["uncertain"]:
                target.confidence = 0.5
                target.threat_level = "MEDIUM"
                if not target.name.startswith("❓"):
                    target.name = f"❓ {target.name}"
            engine.add_target(target)
            result["added"].append(target)
        else:
            # Attach: advance the live track, never teleport it backwards.
            if point is not None:
                max_jump = 0.35 if target.threat_type == ThreatType.BALLISTIC else 0.2
                engine.snap_to_point(target.id, point, max_jump=max_jump)
            if kind == "TERMINAL":
                engine.mark_approaching(target.id)
            if cls_info["uncertain"] and target.confidence > 0.5:
                target.confidence = 0.5

        # Top up to the reported unit count ("Третя" -> at least 3 live tracks).
        if count > 1 and family is not None:
            fresh = engine.family_tracks(channel, family, now)
            need = max(0, count - len(fresh))
            for i in range(need):
                clone = target.model_copy(deep=True)
                clone.id = str(uuid.uuid4())[:8]
                clone.start_time = max(0.0, target.start_time - 45.0 * (i + 1))
                engine.add_target(clone)
                result["added"].append(clone)

        result["primary"] = target
        return result

    @classmethod
    def _dest_guess(cls, text: str, family: Optional[ThreatType]) -> Optional[GeoPoint]:
        """Best-effort destination mention for correlation/creation."""
        m = cls.RE_DESTINATION.search(text)
        if m:
            pt = find_geo_location(m.group(1)[:30]) or find_district(m.group(1)[:30])
            if pt:
                return pt
        m = cls.RE_VECTOR.search(text)
        if m:
            chunk = m.group(1)[:30].lstrip("~")
            pt = find_geo_location(chunk) or find_district(chunk)
            if pt:
                return pt
        return None

    @classmethod
    def extract_origin_and_dest(
        cls, text: str, default_threat: ThreatType
    ) -> Tuple[Optional[GeoPoint], Optional[GeoPoint], bool, bool]:
        """Smart origin/destination extraction.

        Returns (origin|None, dest|None, origin_explicit, dest_explicit).
        Explicit mentions (with declensions and direction words) are
        honoured. NOTHING is invented here: no 'Чауда by default' —
        unknown sides come back as None and the caller starts the track
        where it was actually seen, with low confidence. Only the
        destination keeps a per-type APPROXIMATE fallback ('куда будет
        приблизительно'), flagged invented via explicit=False.
        """
        origin: Optional[GeoPoint] = None
        dest: Optional[GeoPoint] = None
        origin_explicit = False
        dest_explicit = False

        # 1. Search for explicit origin
        origin_match = cls.RE_ORIGIN.search(text)
        if origin_match:
            chunk = origin_match.group(1)[:30]
            origin = find_launch_origin(chunk) or find_geo_location(chunk)
            origin_explicit = origin is not None

        # 2. Search for explicit destination
        dest_match = cls.RE_DESTINATION.search(text)
        if dest_match:
            chunk = dest_match.group(1)[:30]
            dest = find_geo_location(chunk) or find_district(chunk)
            dest_explicit = dest is not None

        # 2b. Terse vectors without "на": "Вектор Оболонь", "далі Київ", "~Нивки"
        if not dest:
            vec_match = cls.RE_VECTOR.search(text)
            if vec_match:
                chunk = vec_match.group(1)[:30].lstrip("~")
                dest = find_geo_location(chunk) or find_district(chunk)
                dest_explicit = dest is not None

        # 3. Fallback scan across text if not captured by regex
        if not dest:
            dest = find_geo_location(text) or find_district(text)
            dest_explicit = dest is not None
        if not origin:
            origin = find_launch_origin(text)
            origin_explicit = origin is not None

        # 4. Approximate destination fallback per type ("куда будет
        # приблизительно"). Origin is NEVER defaulted to a specific
        # base here — inventing 'Чауда' for every jet shahed was the bug.
        # NOTE: always copy — globals must never be mutated by engine ticks
        if not dest:
            if default_threat == ThreatType.BALLISTIC:
                dest = UKRAINE_GEO["київ"].model_copy(deep=True)
            elif default_threat == ThreatType.SHAHED or default_threat == ThreatType.JET_SHAHED:
                dest = UKRAINE_GEO["умань"].model_copy(deep=True)
            elif default_threat == ThreatType.CRUISE_MISSILE:
                dest = UKRAINE_GEO["дніпро"].model_copy(deep=True)
            else:
                dest = UKRAINE_GEO["харків"].model_copy(deep=True)

        # find_* already returns copies, but ensure independence anyway
        if origin is not None:
            origin = origin.model_copy(deep=True)
        # Approximate fallback always provides a destination.
        assert dest is not None
        dest = dest.model_copy(deep=True)

        return origin, dest, origin_explicit, dest_explicit

    @classmethod
    def parse_message(
        cls,
        text: str,
        channel: str = "Telegram",
        force_type: Optional[ThreatType] = None,
    ) -> Optional[RadarTarget]:
        threat_type = force_type or cls.identify_threat_type(text)
        if not threat_type:
            return None

        origin, dest, origin_explicit, dest_explicit = cls.extract_origin_and_dest(text, threat_type)
        assert dest is not None  # approximate fallback always provides one
        # Honest origin: NEVER invent a launch base. Without an explicit
        # launch mention the track starts where it was actually seen
        # (overflight point) or, if only a destination is known, at the
        # destination zone — flagged low-confidence downstream.
        geo_invented = (not origin_explicit) or (not dest_explicit)
        if origin is None:
            origin = cls.extract_point(text) or dest.model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)

        # Threat-specific speed and ETA kinematics
        if threat_type == ThreatType.BALLISTIC:
            speed_kmh, name = cls._ballistic_params(text)
            threat_level = "CRITICAL"
            trajectory = generate_curved_ballistic_arc(origin, dest, num_points=60)
            # Flight time in seconds (e.g. 350 km at 2000 m/s is ~175 sec / 3 mins)
            flight_time_sec = max(dist_km / (speed_kmh / 3600.0), 90.0)
            launcher_pos = origin
        elif threat_type == ThreatType.SHAHED:
            speed_kmh = 175.0   # ~48 m/s, propeller
            name = "БПЛА Shahed-136"
            threat_level = "HIGH"
            trajectory = generate_linear_waypoints(origin, dest, num_points=40)
            flight_time_sec = dist_km / (speed_kmh / 3600.0)
            launcher_pos = None
        elif threat_type == ThreatType.JET_SHAHED:
            speed_kmh = 550.0   # ~150 m/s, jet engine (Shahed-238 / Герань-3)
            name = "Реактивний БПЛА Shahed-238"
            threat_level = "CRITICAL"
            # Jet drones fly faster, higher and straighter than prop ones
            trajectory = generate_linear_waypoints(origin, dest, num_points=40, weave_deg=0.04, weave_cycles=1.2)
            flight_time_sec = dist_km / (speed_kmh / 3600.0)
            launcher_pos = None
        elif threat_type == ThreatType.CRUISE_MISSILE:
            speed_kmh = 820.0   # ~230 m/s
            name = "Крилата ракета (Х-101/Калібр)"
            threat_level = "CRITICAL"
            trajectory = generate_linear_waypoints(origin, dest, num_points=50)
            flight_time_sec = dist_km / (speed_kmh / 3600.0)
            launcher_pos = None
        else: # KAB
            speed_kmh = 900.0
            name = "Керована авіабомба (КАБ)"
            threat_level = "HIGH"
            trajectory = generate_linear_waypoints(origin, dest, num_points=30)
            flight_time_sec = max(dist_km / (speed_kmh / 3600.0), 120.0)
            launcher_pos = None

        bearing = calculate_bearing(origin, dest)
        now = time.time()

        # Presence-only reports (origin == dest: single place mentioned,
        # no movement info) must not die instantly with eta 0. Floor the
        # lifetime so the marker persists until follow-ups or all-clear.
        # Long fake legs used to provide this lifetime for free.
        if dist_km < 1.0:
            flight_time_sec = max(flight_time_sec, 900.0)

        # Invented geography (unknown launch and/or approximate
        # destination) is shown honestly: same danger level, but low
        # confidence + ❓ so a guessed track never looks confirmed.
        confidence = 1.0
        if geo_invented:
            confidence = 0.5
            if not name.startswith("❓"):
                name = f"❓ {name}"

        return RadarTarget(
            id=str(uuid.uuid4())[:8],
            name=name,
            threat_type=threat_type,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=trajectory,
            speed_kmh=speed_kmh,
            start_time=now,
            eta_seconds=round(flight_time_sec, 1),
            remaining_seconds=round(flight_time_sec, 1),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=bearing,
            source_channel=channel,
            raw_text=text.strip(),
            threat_level=threat_level,
            confidence=confidence,
            launcher_pos=launcher_pos.model_copy(deep=True) if launcher_pos else None,
        )
