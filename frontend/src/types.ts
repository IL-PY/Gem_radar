export type ThreatType = 'BALLISTIC' | 'CRUISE_MISSILE' | 'SHAHED' | 'JET_SHAHED' | 'KAB' | 'RECON_UAV';

export type ThreatStatus = 'LAUNCHED' | 'IN_FLIGHT' | 'APPROACHING' | 'IMPACTED' | 'INTERCEPTED' | 'EXPIRED';

export interface GeoPoint {
  lat: number;
  lon: number;
  name: string;
}

export interface RadarTarget {
  id: string;
  name: string;
  threat_type: ThreatType;
  origin: GeoPoint;
  destination: GeoPoint;
  current_position: GeoPoint;
  trajectory_arc: [number, number][]; // [[lat, lon], ...]
  speed_kmh: number;
  start_time: number;
  eta_seconds: number;
  remaining_seconds: number;
  progress: number;
  status: ThreatStatus;
  bearing: number;
  source_channel: string;
  raw_text: string;
  threat_level: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  launcher_pos?: GeoPoint | null;
}

export interface TelegramAlert {
  id: string;
  channel: string;
  text: string;
  timestamp: number;
  threat_type?: ThreatType | null;
  target_id?: string | null;
}

export interface SystemStatus {
  engine_active: boolean;
  telegram_status: string;
  telegram_connected: boolean;
  telegram_error: string;
  monitored_channels: string[];
  active_targets_count: number;
  recent_alerts_count: number;
}
