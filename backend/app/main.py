import asyncio
import json
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.trajectory_engine import engine
from app.telegram_service import telegram_service
from app.mock_simulator import MockSimulator
from app.oblast_alerts import oblast_alerts
from app.neptun_threats import neptun_threats

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Send initial snapshot immediately
        snapshot = engine.get_snapshot()
        await websocket.send_text(json.dumps({"type": "STATE_SYNC", "data": snapshot}))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        # Simulation targets do not persist across sessions: when last client leaves, purge simulated targets
        if not self.active_connections:
            sim_tids = [
                tid for tid, t in engine.active_targets.items()
                if getattr(t, "is_simulated", False) or t.source_channel in ("@test_alerts", "@test_channel", "@manual_input")
            ]
            for tid in sim_tids:
                engine.remove_target(tid)

    async def broadcast(self, message: dict):
        text_data = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text_data)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Hook engine notifications to WebSocket broadcaster
def on_engine_event(event_type: str, data: dict):
    asyncio.create_task(manager.broadcast({"type": event_type, "data": data}))

engine.add_subscriber(on_engine_event)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[Main] Starting GemRadar engine...")
    engine.start()
    oblast_alerts.start()
    neptun_threats.start()
    asyncio.create_task(telegram_service.start())
    yield
    # Shutdown
    print("[Main] Stopping GemRadar services...")
    engine.stop()
    oblast_alerts.stop()
    neptun_threats.stop()
    await telegram_service.stop()

app = FastAPI(title="GemRadar Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CustomSimRequest(BaseModel):
    text: str
    channel: str = "@test_alerts"

@app.get("/api/status")
async def get_status():
    return {
        "engine_active": True,
        "telegram_status": telegram_service.status,
        "telegram_connected": telegram_service.is_connected,
        "telegram_error": telegram_service.error_message,
        "monitored_channels": settings.MONITOR_CHANNELS,
        "active_targets_count": len(engine.active_targets),
        "recent_alerts_count": len(engine.recent_alerts),
    }

@app.get("/api/targets")
async def get_targets():
    return [t.model_dump() for t in engine.active_targets.values()]

@app.get("/api/alerts")
async def get_alerts():
    return [a.model_dump() for a in engine.recent_alerts]

@app.get("/api/oblasts")
async def get_oblasts():
    """Live air-alert levels per oblast (red/yellow), aggregated from neptun.in.ua."""
    return oblast_alerts.snapshot()

@app.get("/api/neptun/threats")
async def get_neptun_threats():
    """Live threat tracks (uav/missile/ballistic/kab/...) from neptun.in.ua."""
    return neptun_threats.snapshot()

@app.get("/api/telegram/check")
async def telegram_check():
    """Read-only diagnostic: resolve + read each monitored TG channel."""
    return await telegram_service.check_channels()

@app.get("/api/telegram/dialogs")
async def telegram_dialogs():
    """Read-only: list account dialogs."""
    return await telegram_service.list_dialogs()

@app.post("/api/telegram/catchup")
async def telegram_catchup():
    """Manually re-run the startup history catch-up (read-only)."""
    return await telegram_service.catchup_history()

@app.post("/api/simulate/custom")
async def run_custom_sim(req: CustomSimRequest):
    target = MockSimulator.simulate_custom_text(req.text, req.channel)
    return {"status": "ok", "target": target.model_dump() if target else None}

@app.post("/api/simulate/{scenario}")
async def run_scenario(scenario: str):
    if scenario == "ballistic":
        target = MockSimulator.launch_ballistic_bryansk_vyshhorod()
        return {"status": "ok", "target": target.model_dump()}
    elif scenario == "shahed":
        target = MockSimulator.launch_shahed_swarm()
        return {"status": "ok", "target": target.model_dump()}
    elif scenario == "cruise":
        target = MockSimulator.launch_cruise_missile_blacksea()
        return {"status": "ok", "target": target.model_dump()}
    elif scenario == "kab":
        target = MockSimulator.launch_kab_kharkiv()
        return {"status": "ok", "target": target.model_dump()}
    elif scenario == "jetshahed":
        target = MockSimulator.launch_jet_shahed_swarm()
        return {"status": "ok", "target": target.model_dump()}
    else:
        raise HTTPException(status_code=400, detail="Unknown scenario")

@app.post("/api/clear")
async def clear_radar():
    for tid in list(engine.active_targets.keys()):
        engine.remove_target(tid)
    return {"status": "cleared"}

# NOTE: /api/telegram/* diagnostics + startup catch-up live here.

@app.websocket("/ws/radar")
async def websocket_radar_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive client ping or commands
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("command")
                if cmd == "SIMULATE_BALLISTIC":
                    MockSimulator.launch_ballistic_bryansk_vyshhorod()
                elif cmd == "SIMULATE_SHAHED":
                    MockSimulator.launch_shahed_swarm()
                elif cmd == "SIMULATE_CRUISE":
                    MockSimulator.launch_cruise_missile_blacksea()
                elif cmd == "CLEAR_ALL":
                    for tid in list(engine.active_targets.keys()):
                        engine.remove_target(tid)
                elif cmd == "REQUEST_SYNC":
                    snapshot = engine.get_snapshot()
                    await websocket.send_text(json.dumps({"type": "STATE_SYNC", "data": snapshot}))
            except Exception as e:
                print(f"[WS] Command error: {e}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
