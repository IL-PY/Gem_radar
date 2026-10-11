from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class ThreatType(str, Enum):
    BALLISTIC = "BALLISTIC"          # Іскандер-М, Кинджал, KN-23, С-300/400
    CRUISE_MISSILE = "CRUISE_MISSILE"# Х-101, Калібр, Х-59/69
    SHAHED = "SHAHED"                # Shahed-136 / Герань-2 (propeller, ~175 km/h)
    JET_SHAHED = "JET_SHAHED"        # Shahed-238 / Герань-3 (jet, ~550 km/h)
    KAB = "KAB"                      # Керована авіабомба (КАБ/УМПК)
    RECON_UAV = "RECON_UAV"          # Розвідувальний БПЛА (Supercam, Zala, Orlan)
    UNKNOWN = "UNKNOWN"              # Unknown threat type

class ThreatStatus(str, Enum):
    LAUNCHED = "LAUNCHED"
    IN_FLIGHT = "IN_FLIGHT"
    APPROACHING = "APPROACHING"
    IMPACTED = "IMPACTED"
    INTERCEPTED = "INTERCEPTED"
    EXPIRED = "EXPIRED"

class GeoPoint(BaseModel):
    lat: float
    lon: float
    name: str = ""

class RadarTarget(BaseModel):
    id: str
    name: str
    threat_type: ThreatType
    origin: GeoPoint
    destination: GeoPoint
    current_position: GeoPoint
    trajectory_arc: List[List[float]] = Field(default_factory=list)  # [[lat, lon], ...]
    speed_kmh: float
    start_time: float                     # Timestamp in seconds
    eta_seconds: float                    # Total flight time
    remaining_seconds: float = 0.0        # Countdown
    progress: float = 0.0                 # 0.0 -> 1.0
    status: ThreatStatus = ThreatStatus.IN_FLIGHT
    bearing: float = 0.0                  # Heading degrees (0..360)
    source_channel: str = ""
    raw_text: str = ""
    threat_level: str = "HIGH"            # CRITICAL, HIGH, MEDIUM
    confidence: float = 1.0             # 1.0 confirmed launch, 0.5 probable/unconfirmed
    launcher_pos: Optional[GeoPoint] = None # Coords for SPUs/MLRS launchers on map
    is_simulated: bool = False          # Flag for mock simulator targets (not persisted)

class TelegramAlert(BaseModel):
    id: str
    channel: str
    text: str
    timestamp: float
    threat_type: Optional[ThreatType] = None
    target_id: Optional[str] = None

class RadarState(BaseModel):
    active_targets: List[RadarTarget]
    recent_alerts: List[TelegramAlert]
    timestamp: float
