import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # Telegram API Credentials
    TG_API_ID: int = 0
    TG_API_HASH: str = ""
    TG_SESSION_FILE: str = str(BASE_DIR / "radar_session.session")
    
    # Anti-ban Client Emulation Parameters
    TG_DEVICE_MODEL: str = "PC 64bit"
    TG_SYSTEM_VERSION: str = "Windows 11 Pro"
    TG_APP_VERSION: str = "4.16.8 x64"
    TG_LANG_CODE: str = "uk"
    TG_SYSTEM_LANG_CODE: str = "uk-UA"
    TG_FLOOD_SLEEP_THRESHOLD: int = 120
    
    # Monitored Channels (Usernames without @ or Channel IDs).
    # STRICT whitelist: anything else (DMs, groups, other channels) is ignored.
    MONITOR_CHANNELS: list[str] = [
        "kpszsu",            # Повітряні Сили ЗСУ (офіційний)
        "vanek_nikolaev",    # Николаевский Ванёк (оперативні вектори)
        "war_monitor",       # monitor (тактичні зведення, пуски)
        "air_alert_ua",      # Карта тривог України
        "eRadarrua",         # єРадар
        "tryvoga_chomu",     # Тривога Чому (тривоги)
    ]
    
    # Radar Simulation & Engine Configuration
    RADAR_TICK_RATE_HZ: float = 2.0  # Server state broadcast frequency
    AUTO_SIMULATION_ON_IDLE: bool = False

    # Startup catch-up: replay recent channel history through the tracker
    # so the map shows ongoing raids immediately, not just new messages.
    CATCHUP_LIMIT_PER_CHANNEL: int = 40
    CATCHUP_MAX_AGE_SEC: int = 7200  # ignore messages older than 2h
    
    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()
