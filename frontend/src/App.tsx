import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TacticalMap } from './components/TacticalMap';
import { Header } from './components/Header';
import { AlertsDrawer } from './components/AlertsDrawer';
import { TargetInspector } from './components/TargetInspector';
import { SimulationControls } from './components/SimulationControls';
import { soundSystem } from './utils/audio';
import type { RadarTarget, TelegramAlert, SystemStatus } from './types';

export const App: React.FC = () => {
  const [targets, setTargets] = useState<RadarTarget[]>([]);
  const [alerts, setAlerts] = useState<TelegramAlert[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<RadarTarget | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isAlertsOpen, setIsAlertsOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial REST data & status
  const fetchStatusAndData = useCallback(async () => {
    try {
      const [resStatus, resTargets, resAlerts] = await Promise.all([
        fetch('/api/status').then((r) => r.json()),
        fetch('/api/targets').then((r) => r.json()),
        fetch('/api/alerts').then((r) => r.json()),
      ]);
      setSystemStatus(resStatus);
      setTargets(resTargets);
      setAlerts(resAlerts);
    } catch {
      // Backend may still be spinning up
    }
  }, []);

  // WebSocket Connection
  useEffect(() => {
    fetchStatusAndData();

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/radar`;

      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE_SYNC') {
            setTargets(msg.data.targets || []);
            setAlerts(msg.data.alerts || []);
          } else if (msg.type === 'TARGET_SPAWNED') {
            const newTarget: RadarTarget = msg.data;
            setTargets((prev) => [...prev.filter((t) => t.id !== newTarget.id), newTarget]);
            // Play alert sound
            if (newTarget.threat_type === 'BALLISTIC') {
              soundSystem.playBallisticAlarm();
            } else if (newTarget.threat_type === 'SHAHED' || newTarget.threat_type === 'JET_SHAHED') {
              soundSystem.playDroneAlert();
            } else {
              soundSystem.playRadarPing();
            }
          } else if (msg.type === 'TARGET_UPDATED') {
            const updated: RadarTarget = msg.data;
            setTargets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          } else if (msg.type === 'TARGET_REMOVED') {
            setTargets((prev) => prev.filter((t) => t.id !== msg.data.id));
            setSelectedTarget((curr) => (curr?.id === msg.data.id ? null : curr));
          } else if (msg.type === 'ALERT_RECEIVED') {
            const newAlert: TelegramAlert = msg.data;
            setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
          }
        } catch (e) {
          console.error('WS Parse error', e);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connectWebSocket();

    const intervalStatus = setInterval(fetchStatusAndData, 10000);

    return () => {
      clearInterval(intervalStatus);
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [fetchStatusAndData]);

  // Audio Toggle
  const handleToggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    soundSystem.enabled = nextState;
    if (nextState) {
      soundSystem.playRadarPing();
    }
  };

  // Simulation Triggers
  const handleSimulate = async (scenario: 'ballistic' | 'shahed' | 'cruise' | 'kab' | 'jetshahed') => {
    soundSystem.playRadarPing();
    try {
      await fetch(`/api/simulate/${scenario}`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulateCustom = async (text: string) => {
    soundSystem.playRadarPing();
    try {
      await fetch('/api/simulate/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, channel: '@manual_input' }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearRadar = async () => {
    soundSystem.playRadarPing();
    try {
      await fetch('/api/clear', { method: 'POST' });
      setTargets([]);
      setSelectedTarget(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#030407] select-none">
      {/* Tactical Top Header */}
      <Header
        targets={targets}
        wsConnected={wsConnected}
        systemStatus={systemStatus}
        soundEnabled={soundEnabled}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((curr) => (curr === '2D' ? '3D' : '2D'))}
        onToggleSound={handleToggleSound}
        onToggleAlerts={() => setIsAlertsOpen(!isAlertsOpen)}
        onToggleSimulator={() => setIsSimulatorOpen(!isSimulatorOpen)}
        isAlertsOpen={isAlertsOpen}
        isSimulatorOpen={isSimulatorOpen}
      />

      {/* Main Fullscreen Tactical Map */}
      <TacticalMap
        targets={targets}
        selectedTargetId={selectedTarget?.id || null}
        onSelectTarget={(target) => setSelectedTarget(target)}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((curr) => (curr === '2D' ? '3D' : '2D'))}
      />

      {/* Target Telemetry Card */}
      <TargetInspector
        target={selectedTarget}
        onClose={() => setSelectedTarget(null)}
      />

      {/* Telegram Live Alerts Drawer */}
      <AlertsDrawer
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        alerts={alerts}
        systemStatus={systemStatus}
      />

      {/* Tactical Simulation Panel */}
      <SimulationControls
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onSimulate={handleSimulate}
        onSimulateCustom={handleSimulateCustom}
        onClear={handleClearRadar}
      />
    </div>
  );
};

export default App;
