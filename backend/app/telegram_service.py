import os
import time
import asyncio
import uuid
from typing import Optional, List
from telethon import TelegramClient, events
from telethon.errors import FloodWaitError
from app.config import settings
from app.parser import ThreatParser
from app.trajectory_engine import engine
from app.models import TelegramAlert

class TelegramMonitorService:
    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self.is_connected = False
        self.status = "INITIALIZING"
        self.error_message = ""
        self._listener_task: Optional[asyncio.Task] = None

    async def start(self):
        """Starts the Telegram listener if credentials and session exist."""
        # Check credentials
        if not settings.TG_API_ID or not settings.TG_API_HASH:
            self.status = "CREDENTIALS_MISSING"
            self.error_message = "TG_API_ID / TG_API_HASH not set in .env"
            print(f"[TelegramMonitor] {self.error_message}. Operating in mock/test mode.")
            return

        session_path = settings.TG_SESSION_FILE
        if not os.path.exists(session_path) and not os.path.exists(f"{session_path}.session"):
            self.status = "SESSION_FILE_MISSING"
            self.error_message = f"Session file not found at: {session_path}"
            print(f"[TelegramMonitor] {self.error_message}. Ready for session upload.")
            return

        try:
            print("[TelegramMonitor] Initializing safe MTProto client...")
            # Safe client parameters mimicking official desktop application
            self.client = TelegramClient(
                session=session_path,
                api_id=settings.TG_API_ID,
                api_hash=settings.TG_API_HASH,
                device_model=settings.TG_DEVICE_MODEL,
                system_version=settings.TG_SYSTEM_VERSION,
                app_version=settings.TG_APP_VERSION,
                lang_code=settings.TG_LANG_CODE,
                system_lang_code=settings.TG_SYSTEM_LANG_CODE,
                flood_sleep_threshold=settings.TG_FLOOD_SLEEP_THRESHOLD,
            )

            await self.client.connect()

            if not await self.client.is_user_authorized():
                self.status = "SESSION_UNAUTHORIZED"
                self.error_message = "Provided .session is unauthorized or expired"
                print(f"[TelegramMonitor] {self.error_message}")
                return

            self.is_connected = True
            self.status = "CONNECTED"
            print("[TelegramMonitor] Successfully authorized and connected to Telegram!")

            # Register message event handler
            @self.client.on(events.NewMessage())
            async def handle_new_message(event):
                await self._process_incoming_message(event)

            # Keep client running in background
            self._listener_task = asyncio.create_task(self.client.run_until_disconnected())

            # Startup catch-up: replay recent history so ongoing raids show up
            # immediately (read-only, paced).
            asyncio.create_task(self.catchup_history())

        except FloodWaitError as e:
            self.status = "FLOOD_WAIT"
            self.error_message = f"Telegram FloodWait for {e.seconds} seconds"
            print(f"[TelegramMonitor] Anti-ban safety triggered: sleeping {e.seconds}s")
            await asyncio.sleep(e.seconds)
        except Exception as e:
            self.status = "ERROR"
            self.error_message = str(e)
            print(f"[TelegramMonitor] Connection error: {e}")

    async def _process_incoming_message(self, event):
        """Processes incoming messages from monitored channels."""
        try:
            chat = await event.get_chat()
            chat_username = getattr(chat, "username", "") or ""
            chat_title = getattr(chat, "title", "") or chat_username or "Unknown"

            # STRICT whitelist: only listed channels are processed.
            # Everything else (DMs, groups, no-username chats) is ignored.
            monitored = [c.lower() for c in settings.MONITOR_CHANNELS]
            if (chat_username or "").lower() not in monitored:
                return

            text = event.raw_text
            if not text or len(text.strip()) < 4:
                return

            print(f"[TelegramMonitor] Alert from @{chat_username}: {text[:60]}...")

            # Stateful stream processing: correlate with live tracks
            # (updates attach, intercepts resolve, all-clears purge)
            result = ThreatParser.process_message(text, channel=f"@{chat_username}" if chat_username else chat_title)

            alert = TelegramAlert(
                id=str(uuid.uuid4())[:8],
                channel=f"@{chat_username}" if chat_username else chat_title,
                text=text,
                timestamp=time.time(),
                threat_type=result["family"].value if result["family"] else None,
                target_id=result["primary"].id if result["primary"] else None,
            )
            engine.add_alert(alert)

        except Exception as e:
            print(f"[TelegramMonitor] Error parsing message: {e}")

    async def catchup_history(self):
        """Startup catch-up (read-only): replay recent channel history oldest-
        first through the stateful tracker so ongoing raids appear on the map
        immediately instead of only from newly arriving messages."""
        if not self.client or not self.is_connected:
            return {"done": False, "reason": "not connected"}
        from app.parser import ThreatParser
        cutoff = time.time() - settings.CATCHUP_MAX_AGE_SEC
        total_msgs = 0
        for username in settings.MONITOR_CHANNELS:
            try:
                entity = await self.client.get_entity(username)
                batch = []
                async for msg in self.client.iter_messages(
                    entity, limit=settings.CATCHUP_LIMIT_PER_CHANNEL
                ):
                    if not getattr(msg, "raw_text", None):
                        continue
                    ts = msg.date.timestamp() if getattr(msg, "date", None) else 0
                    if ts < cutoff:
                        continue
                    batch.append(msg.raw_text)
                # oldest first so launches precede their updates
                for text in reversed(batch):
                    if text and len(text.strip()) >= 4:
                        try:
                            ThreatParser.process_message(text, channel=f"@{username}")
                        except Exception as e:
                            print(f"[TelegramMonitor] catch-up parse error: {e}")
                        total_msgs += 1
            except Exception as e:
                print(f"[TelegramMonitor] catch-up failed for @{username}: {str(e)[:120]}")
            await asyncio.sleep(1.5)
        active = len(engine.active_targets)
        print(f"[TelegramMonitor] catch-up done: {total_msgs} msgs replayed, {active} live tracks")
        return {"done": True, "replayed": total_msgs, "live_tracks": active}

    async def check_channels(self):
        """Read-only diagnostic: can we resolve + read each monitored channel?

        No joins, no messages, no reactions — pure reads with 1s pacing.
        Returns {"connected": bool, "channels": [{channel, ok, title, ...}]}.
        """
        if not self.client or not self.is_connected:
            return {"connected": False, "status": self.status,
                    "error": self.error_message, "channels": []}
        out = []
        for username in settings.MONITOR_CHANNELS:
            info = {"channel": username, "ok": False}
            try:
                entity = await self.client.get_entity(username)
                info["title"] = getattr(entity, "title", "") or ""
                info["id"] = getattr(entity, "id", None)
                info["broadcast"] = getattr(entity, "broadcast", None)
                # Membership: live NewMessage updates arrive ONLY for channels
                # the account participates in. Reading history works anyway.
                try:
                    from telethon.tl.functions.channels import GetParticipantRequest
                    part = await self.client(GetParticipantRequest(entity, "me"))
                    info["member"] = True
                    info["role"] = type(getattr(part, "participant", None)).__name__
                except Exception as me:
                    info["member"] = False
                    info["member_error"] = type(me).__name__
                msgs = await self.client.get_messages(entity, limit=1)
                if msgs:
                    m = msgs[0]
                    info["last_message_date"] = m.date.isoformat() if getattr(m, "date", None) else None
                    info["last_message_preview"] = (getattr(m, "raw_text", "") or "")[:120]
                else:
                    info["last_message_date"] = None
                    info["last_message_preview"] = ""
                info["ok"] = True
            except Exception as e:
                info["error"] = str(e)[:200]
            out.append(info)
            await asyncio.sleep(1)
        return {"connected": True, "status": self.status, "channels": out}

    async def list_dialogs(self, limit: int = 100):
        """Read-only: list account dialogs (channels/groups/chats)."""
        if not self.client or not self.is_connected:
            return {"connected": False, "dialogs": []}
        out = []
        async for d in self.client.iter_dialogs(limit=limit):
            ent = d.entity
            out.append({
                "id": getattr(ent, "id", None),
                "name": getattr(d, "name", "") or "",
                "username": getattr(ent, "username", "") or "",
                "is_channel": bool(getattr(d, "is_channel", False)),
                "is_group": bool(getattr(d, "is_group", False)),
                "is_user": bool(getattr(d, "is_user", False)),
                "unread": getattr(d, "unread_count", 0),
            })
        return {"connected": True, "count": len(out), "dialogs": out}

    async def stop(self):
        if self.client and self.client.is_connected():
            await self.client.disconnect()
            self.is_connected = False
            self.status = "DISCONNECTED"

telegram_service = TelegramMonitorService()
