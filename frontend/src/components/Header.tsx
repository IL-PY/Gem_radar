import React, { useState, useEffect } from 'react';
import { ShieldAlert, Radio, Volume2, VolumeX, Crosshair, Bell, Terminal, Plane, Rocket, Globe, Map as MapIcon } from 'lucide-react';
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

  // Live Kyiv clock for the tactical strip.
  const [clock, setClock] = useState<string>('--:--:--');
  useEffect(() => {
    const tick = () => {
      try {
        setClock(
          new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        );
      } catch {
        setClock(new Date().toLocaleTimeString());
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const seg = (active: boolean, glow: string) =>
    `flex items-center space-x-2 px-4 py-1.5 font-mono text-xs transition-all ${
      active ? glow : 'text-slate-500'
    }`;

  return (
    <header className="absolute top-0 left-0 right-0 z-30 bg-[#05070d]/90 backdrop-blur-xl border-b border-white/10 shadow-[0_10px_36px_rgba(0,0,0,0.55)] text-slate-200">
      <div className="flex items-stretch justify-between gap-3 px-4 py-1.5">
        {/* Brand block */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="relative flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-rose-600 via-rose-700 to-red-950 border border-rose-400/40 shadow-[0_0_18px_rgba(244,63,94,0.45)]">
            <Crosshair className="w-5 h-5 text-white animate-spin [animation-duration:8s]" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[15px] font-black tracking-[0.22em] text-white">
                GEM<span className="text-rose-500">RADAR</span>
              </span>
              <span className="flex items-center space-x-1 text-[10px] font-mono font-bold tracking-widest text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)] animate-pulse" />
                <span>LIVE</span>
              </span>
              <span className="hidden lg:inline text-[11px] font-mono tabular-nums text-slate-400">{clock}</span>
            </div>
            <div className="hidden sm:flex items-center space-x-2 text-[10px] font-mono">
              <span className={`flex items-center space-x-1 ${wsConnected ? 'text-slate-400' : 'text-rose-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-rose-500'} animate-pulse`} />
                <span>{wsConnected ? 'СЕРВЕР OK' : 'ВІДКЛЮЧЕНО'}</span>
              </span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center space-x-1 text-slate-400">
                <Radio className="w-3 h-3 text-sky-400" />
                <span>{systemStatus?.telegram_connected ? 'TG ОНЛАЙН' : 'TG СИМУЛЯТОР'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Unified threat strip */}
        <div className="flex items-stretch rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden divide-x divide-white/10">
          <div className={seg(ballisticCount > 0, 'bg-rose-600/20 text-rose-200 shadow-[inset_0_0_18px_rgba(244,63,94,0.25)]' + (ballisticCount > 0 ? ' animate-pulse' : ''))}>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span className="hidden md:inline font-semibold tracking-[0.14em]">БАЛІСТИКА</span>
            <span className="font-black text-base tabular-nums text-white">{ballisticCount}</span>
          </div>
          <div className={seg(shahedCount > 0, 'bg-amber-500/20 text-amber-200 shadow-[inset_0_0_18px_rgba(245,158,11,0.25)]')}>
            <Plane className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline font-semibold tracking-[0.14em]">ШАХЕДИ</span>
            <span className="font-black text-base tabular-nums text-white">{shahedCount}</span>
          </div>
          <div className={seg(missileCount > 0, 'bg-sky-500/20 text-sky-200 shadow-[inset_0_0_18px_rgba(56,189,248,0.25)]')}>
            <Rocket className="w-4 h-4 text-sky-400" />
            <span className="hidden md:inline font-semibold tracking-[0.14em]">КР/КАБ</span>
            <span className="font-black text-base tabular-nums text-white">{missileCount}</span>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="flex items-stretch rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden divide-x divide-white/10">
          <button
            onClick={onToggleViewMode}
            className={`flex items-center space-x-1.5 px-3 font-mono text-xs font-bold tracking-wide transition-all ${
              viewMode === '3D' ? 'bg-rose-600/25 text-rose-200' : 'text-sky-300 hover:bg-white/[0.06]'
            }`}
            title="Перемикання між 2D та 3D режимами"
          >
            {viewMode === '3D' ? <Globe className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
            <span className="hidden sm:inline">{viewMode === '3D' ? '3D' : '2D'}</span>
          </button>
          <button
            onClick={onToggleSound}
            className={`px-3 transition-all ${soundEnabled ? 'text-amber-300 hover:bg-white/[0.06]' : 'text-slate-600 hover:bg-white/[0.06]'}`}
            title={soundEnabled ? 'Вимкнути звук сирени' : 'Увімкнути звук сирени'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={onToggleSimulator}
            className={`flex items-center space-x-1.5 px-3 font-mono text-xs font-semibold tracking-wide transition-all ${
              isSimulatorOpen ? 'bg-amber-500/25 text-amber-200' : 'text-slate-300 hover:bg-white/[0.06]'
            }`}
            title="Панель тестових пусків"
          >
            <Terminal className="w-4 h-4 text-amber-400" />
            <span className="hidden lg:inline">СИМ</span>
          </button>
          <button
            onClick={onToggleAlerts}
            className={`flex items-center space-x-1.5 px-3 font-mono text-xs font-semibold tracking-wide transition-all ${
              isAlertsOpen ? 'bg-rose-600/25 text-rose-200' : 'text-slate-300 hover:bg-white/[0.06]'
            }`}
          >
            <Bell className="w-4 h-4 text-rose-400" />
            <span className="hidden lg:inline">ТГ</span>
          </button>
        </div>
      </div>
      {/* Signature gradient hairline */}
      <div className="h-[2px] bg-gradient-to-r from-rose-600 via-violet-500 to-sky-500 opacity-80" />
    </header>
  );
};
