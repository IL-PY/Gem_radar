import React from 'react';
import { ShieldAlert, Radio, Volume2, VolumeX, Crosshair, Bell, Terminal } from 'lucide-react';
import type { RadarTarget, SystemStatus } from '../types';

interface HeaderProps {
  targets: RadarTarget[];
  wsConnected: boolean;
  systemStatus: SystemStatus | null;
  soundEnabled: boolean;
  viewMode: '2D' | '3D';
  onToggleViewMode: () => void;
  onToggleSound: () => void;
  onToggleAlerts: () => void;
  onToggleSimulator: () => void;
  isAlertsOpen: boolean;
  isSimulatorOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  targets,
  wsConnected,
  systemStatus,
  soundEnabled,
  viewMode,
  onToggleViewMode,
  onToggleSound,
  onToggleAlerts,
  onToggleSimulator,
  isAlertsOpen,
  isSimulatorOpen,
}) => {
  const ballisticCount = targets.filter((t) => t.threat_type === 'BALLISTIC').length;
  const shahedCount = targets.filter((t) => t.threat_type === 'SHAHED' || t.threat_type === 'JET_SHAHED').length;
  const missileCount = targets.filter((t) => t.threat_type === 'CRUISE_MISSILE' || t.threat_type === 'KAB').length;

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2.5 bg-black/85 backdrop-blur-md border-b border-slate-800 text-slate-200">
      {/* Brand & Status */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="relative flex items-center justify-center w-8 h-8 rounded bg-rose-950/70 border border-rose-600/80">
            <Crosshair className="w-5 h-5 text-rose-500 animate-spin [animation-duration:8s]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-base font-black tracking-wider text-white">
                GEM<span className="text-rose-500">RADAR</span>
              </span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold tracking-widest text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 rounded">
                LIVE 60FPS
              </span>
            </div>
            <div className="text-[10px] font-mono tracking-tight text-slate-400">
              МОНІТОРИНГ ТРАЄКТОРІЙ У РЕАЛЬНОМУ ЧАСІ
            </div>
          </div>
        </div>

        {/* Telegram & WS indicators */}
        <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-800 text-xs font-mono">
          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-[11px] text-slate-300">
              {wsConnected ? 'СЕРВЕР: OK' : 'ВІДКЛЮЧЕНО'}
            </span>
          </div>

          <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] text-slate-300">
              {systemStatus?.telegram_connected ? 'TG: ОНЛАЙН' : 'TG: СИМУЛЯТОР'}
            </span>
          </div>
        </div>
      </div>

      {/* Threat Counter HUD Badges */}
      <div className="flex items-center space-x-2 md:space-x-3">
        {/* Ballistics */}
        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded border font-mono text-xs transition-all ${
          ballisticCount > 0
            ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse'
            : 'bg-slate-950/70 border-slate-800 text-slate-400'
        }`}>
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <span className="hidden sm:inline font-medium">БАЛІСТИКА:</span>
          <span className="font-bold text-sm text-white">{ballisticCount}</span>
        </div>

        {/* Shahed drones */}
        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded border font-mono text-xs transition-all ${
          shahedCount > 0
            ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
            : 'bg-slate-950/70 border-slate-800 text-slate-400'
        }`}>
          <span className="text-amber-400 font-bold">🛸</span>
          <span className="hidden sm:inline font-medium">ШАХЕДИ:</span>
          <span className="font-bold text-sm text-white">{shahedCount}</span>
        </div>

        {/* Cruise Missiles */}
        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded border font-mono text-xs transition-all ${
          missileCount > 0
            ? 'bg-sky-950/80 border-sky-500 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
            : 'bg-slate-950/70 border-slate-800 text-slate-400'
        }`}>
          <span className="text-sky-400 font-bold">🚀</span>
          <span className="hidden sm:inline font-medium">КР/КАБ:</span>
          <span className="font-bold text-sm text-white">{missileCount}</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center space-x-2">
        {/* 2D / 3D Mode Toggle */}
        <button
          onClick={onToggleViewMode}
          className={`flex items-center space-x-1 px-2.5 py-1.5 rounded border text-xs font-mono font-bold transition-all ${
            viewMode === '3D'
              ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-sm shadow-rose-900/50'
              : 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-slate-800'
          }`}
          title="Перемикання між 2D та 3D режимами"
        >
          <span>{viewMode === '3D' ? '🌐 3D РЕЖИМ' : '🗺️ 2D РЕЖИМ'}</span>
        </button>

        {/* Sound Toggle */}
        <button
          onClick={onToggleSound}
          className={`p-2 rounded border transition-colors ${
            soundEnabled
              ? 'bg-slate-900 border-slate-700 text-amber-400 hover:bg-slate-800'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-900'
          }`}
          title={soundEnabled ? 'Вимкнути звук сирени' : 'Увімкнути звук сирени'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Simulator Toggle */}
        <button
          onClick={onToggleSimulator}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${
            isSimulatorOpen
              ? 'bg-amber-950/80 border-amber-500 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
          title="Панель тестових пусків"
        >
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline">СИМУЛЯТОР</span>
        </button>

        {/* Telegram Alerts Drawer Button */}
        <button
          onClick={onToggleAlerts}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${
            isAlertsOpen
              ? 'bg-rose-950/80 border-rose-500 text-rose-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Bell className="w-3.5 h-3.5 text-rose-400" />
          <span className="hidden sm:inline">ЗВЕДЕННЯ ТГ</span>
        </button>
      </div>
    </header>
  );
};
