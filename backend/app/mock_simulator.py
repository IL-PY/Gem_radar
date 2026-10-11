import time
import uuid
from app.models import ThreatType, ThreatStatus, RadarTarget, TelegramAlert
from app.geo_database import (
    UKRAINE_GEO,
    LAUNCH_ORIGINS,
    generate_curved_ballistic_arc,
    generate_linear_waypoints,
    haversine_distance_km,
    calculate_bearing,
)
from app.trajectory_engine import engine
from app.parser import ThreatParser

class MockSimulator:
    @staticmethod
    def launch_ballistic_bryansk_vyshhorod():
        """Exact replica of the user's reference image: Iskander from Bryansk to Vyshhorod/Kyiv."""
        origin = LAUNCH_ORIGINS["брянськ"].model_copy(deep=True)
        dest = UKRAINE_GEO["вишгород"].model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)
        speed_kmh = 7400.0  # Mach 6+
        flight_time_sec = round(dist_km / (speed_kmh / 3600.0), 1)

        arc = generate_curved_ballistic_arc(origin, dest, num_points=60)
        now = time.time()

        target = RadarTarget(
            id=str(uuid.uuid4())[:8],
            name="Іскандер-М (9М723)",
            threat_type=ThreatType.BALLISTIC,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=arc,
            speed_kmh=speed_kmh,
            start_time=now,
            eta_seconds=max(flight_time_sec, 95.0),
            remaining_seconds=max(flight_time_sec, 95.0),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=calculate_bearing(origin, dest),
            source_channel="@vanek_nikolaev",
            raw_text="Пуск баллистики с Брянской области! Направление: Черниговщина / Киев / Вышгород!",
            threat_level="CRITICAL",
            launcher_pos=origin.model_copy(deep=True),
        )

        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel="@vanek_nikolaev",
            text="Пуск баллистики с Брянской области! Направление: Черниговщина / Киев / Вышгород! Срочно в укрытия!",
            timestamp=now,
            threat_type=ThreatType.BALLISTIC,
            target_id=target.id,
        )

        engine.add_alert(alert)
        engine.add_target(target)
        return target

    @staticmethod
    def launch_shahed_swarm():
        """Shahed UAV group flying from Cape Chauda (Crimea) through South towards Central Ukraine."""
        origin = LAUNCH_ORIGINS["чауда"].model_copy(deep=True)
        dest = UKRAINE_GEO["умань"].model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)
        speed_kmh = 175.0
        flight_time_sec = round(dist_km / (speed_kmh / 3600.0), 1)

        path = generate_linear_waypoints(origin, dest, num_points=45, weave_deg=0.09, weave_cycles=2.5)
        now = time.time()

        target = RadarTarget(
            id=str(uuid.uuid4())[:8],
            name="Група БПЛА «Shahed-136»",
            threat_type=ThreatType.SHAHED,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=path,
            speed_kmh=speed_kmh,
            start_time=now,
            # For realistic test pacing: 600 seconds simulation flight time
            eta_seconds=min(flight_time_sec, 600.0),
            remaining_seconds=min(flight_time_sec, 600.0),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=calculate_bearing(origin, dest),
            source_channel="@kpszsu",
            raw_text="Група ударних БпЛА з півдня (Чауда) через Миколаївщину курсом на Кіровоградщину/Умань!",
            threat_level="HIGH",
            launcher_pos=None,
        )

        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel="@kpszsu",
            text="Група «Шахедів» на півдні! Вектор руху — Умань/Черкащина.",
            timestamp=now,
            threat_type=ThreatType.SHAHED,
            target_id=target.id,
        )

        engine.add_alert(alert)
        engine.add_target(target)
        return target

    @staticmethod
    def launch_cruise_missile_blacksea():
        """Kalibr cruise missile from Black Sea towards Odesa / Kremenchuk."""
        origin = LAUNCH_ORIGINS["чорне море"].model_copy(deep=True)
        dest = UKRAINE_GEO["кременчук"].model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)
        speed_kmh = 820.0
        flight_time_sec = round(dist_km / (speed_kmh / 3600.0), 1)

        path = generate_linear_waypoints(origin, dest, num_points=50, weave_deg=0.035, weave_cycles=1.5)
        now = time.time()

        target = RadarTarget(
            id=str(uuid.uuid4())[:8],
            name="КР «Калібр»",
            threat_type=ThreatType.CRUISE_MISSILE,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=path,
            speed_kmh=speed_kmh,
            start_time=now,
            eta_seconds=max(flight_time_sec, 180.0),
            remaining_seconds=max(flight_time_sec, 180.0),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=calculate_bearing(origin, dest),
            source_channel="@monitorwar",
            raw_text="Пуск крилатих ракет «Калібр» з акваторії Чорного моря! Курс на Кременчук.",
            threat_level="CRITICAL",
            launcher_pos=None,
        )

        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel="@monitorwar",
            text="Крилаті ракети через південь в напрямку Полтавщини / Кременчука!",
            timestamp=now,
            threat_type=ThreatType.CRUISE_MISSILE,
            target_id=target.id,
        )

        engine.add_alert(alert)
        engine.add_target(target)
        return target

    @staticmethod
    def launch_jet_shahed_swarm():
        """Jet-powered Shahed-238 / Geran-3 group: ~550 km/h, higher, straighter."""
        origin = LAUNCH_ORIGINS["приморсько-ахтарськ"].model_copy(deep=True)
        dest = UKRAINE_GEO["дніпро"].model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)
        speed_kmh = 550.0
        flight_time_sec = round(dist_km / (speed_kmh / 3600.0), 1)

        path = generate_linear_waypoints(origin, dest, num_points=40, weave_deg=0.04, weave_cycles=1.2)
        now = time.time()

        target = RadarTarget(
            id=str(uuid.uuid4())[:8],
            name="Реактивні БПЛА «Shahed-238»",
            threat_type=ThreatType.JET_SHAHED,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=path,
            speed_kmh=speed_kmh,
            start_time=now,
            # Same test pacing as prop shaheds: compress long flight to ≤600 s
            eta_seconds=min(flight_time_sec, 600.0),
            remaining_seconds=min(flight_time_sec, 600.0),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=calculate_bearing(origin, dest),
            source_channel="@kpszsu",
            raw_text="Реактивні БпЛА (Shahed-238) з Приморсько-Ахтарська курсом на Дніпро! Швидкість ~550 км/год!",
            threat_level="CRITICAL",
            launcher_pos=None,
        )

        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel="@kpszsu",
            text="Реактивні «Шахеди» (238-мі) зі сходу! Вектор руху — Дніпро. Швидкість висока!",
            timestamp=now,
            threat_type=ThreatType.JET_SHAHED,
            target_id=target.id,
        )

        engine.add_alert(alert)
        engine.add_target(target)
        return target

    @staticmethod
    def launch_kab_kharkiv():
        """UMPK glide bomb released from a Su-34 over Belgorod oblast towards Kharkiv.

        Unlike ballistics the ground track is short and straight; the frontend
        renders a DESCENDING glide profile (release ~9 km -> impact 0).
        """
        from app.models import GeoPoint
        origin = GeoPoint(lat=50.35, lon=36.70, name="Бєлгородська обл (пуск КАБ)")
        dest = UKRAINE_GEO["харків"].model_copy(deep=True)
        dist_km = haversine_distance_km(origin, dest)
        speed_kmh = 850.0
        flight_time_sec = round(dist_km / (speed_kmh / 3600.0), 1)

        path = generate_linear_waypoints(origin, dest, num_points=30)
        now = time.time()

        target = RadarTarget(
            id=str(uuid.uuid4())[:8],
            name="КАБ (УМПК)",
            threat_type=ThreatType.KAB,
            origin=origin.model_copy(deep=True),
            destination=dest.model_copy(deep=True),
            current_position=origin.model_copy(deep=True),
            trajectory_arc=path,
            speed_kmh=speed_kmh,
            start_time=now,
            eta_seconds=max(flight_time_sec, 120.0),
            remaining_seconds=max(flight_time_sec, 120.0),
            progress=0.0,
            status=ThreatStatus.IN_FLIGHT,
            bearing=calculate_bearing(origin, dest),
            source_channel="@war_monitor",
            raw_text="Пуск КАБ з борту Су-34 над Бєлгородщиною! Напрямок: Харків!",
            threat_level="HIGH",
            launcher_pos=None,
        )

        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel="@war_monitor",
            text="Загроза застосування КАБ по Харкову! Перебувайте в укриттях!",
            timestamp=now,
            threat_type=ThreatType.KAB,
            target_id=target.id,
        )

        engine.add_alert(alert)
        engine.add_target(target)
        return target

    @staticmethod
    def simulate_custom_text(text: str, channel: str = "@test_channel"):
        """Stateful parse: behaves exactly like a live channel message."""
        now = time.time()
        result = ThreatParser.process_message(text, channel=channel)
        primary = result.get("primary")
        alert = TelegramAlert(
            id=str(uuid.uuid4())[:8],
            channel=channel,
            text=text,
            timestamp=now,
            threat_type=result["family"].value if result["family"] else None,
            target_id=primary.id if primary else None,
        )
        engine.add_alert(alert)
        return primary
