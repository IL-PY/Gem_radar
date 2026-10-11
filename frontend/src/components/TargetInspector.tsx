import React, { useEffect, useState } from 'react';
import { X, Navigation, Gauge, Clock, MapPin, Radio, AlertTriangle } from 'lucide-react';
import type { RadarTarget } from '../types';

interface TargetInspectorProps {
  target: RadarTarget | null;
  onClose: () => void;
}

export const TargetInspector: React.FC<TargetInspectorProps> = ({ target, onClose }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!target) return;

    const updateTimer = () => {
      const now = Date.now() / 1000;
      const elapsed = now - target.start_time;
      const rem = Math.max(0, target.eta_seconds - elapsed);
      setSecondsLeft(Math.round(rem));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [target]);

  if (!target) return null;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isBallistic = target.threat_type === 'BALLISTIC';
  const progressPercent = Math.min(Math.round(target.progress * 100), 100);

  return (
    <div className="absolute bottom-6 left-4 z-30 w-80 max-w-[calc(100vw-32px)] bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-slate-200">
      {/* Header */}
      <div className={`flex items-center justify-between px-3.5 py-2.5 border-b ${
        isBallistic ? 'bg-rose-950/70 border-rose-800/80' : 'bg-amber-950/70 border-amber-800/80'
      }`}>
        <div className="flex items-center space-x-2">
          <AlertTriangle className={`w-4 h-4 ${isBallistic ? 'text-rose-400 animate-bounce' : 'text-amber-400'}`} />
          <span className="font-bold text-xs uppercase tracking-wider text-white">
            {target.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-black/40 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3.5 space-y-3 text-xs">
        {/* Live Countdown & Progress Bar */}
        <div className="p-2.5 rounded bg-black/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className={`w-4 h-4 ${secondsLeft > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
            <span className="text-[11px] text-slate-400 font-sans">Орієнтовний підліт (ETA):</span>
          </div>
          <span className={`text-base font-bold tracking-widest ${
            secondsLeft <= 60 ? 'text-rose-400 animate-pulse' : 'text-white'
          }`}>
            {formatTimer(secondsLeft)}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Прогрес траєкторії</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isBallistic ? 'bg-rose-500' : 'bg-amber-500'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="flex items-center space-x-1 text-slate-400 mb-0.5">
              <Gauge className="w-3 h-3 text-sky-400" />
              <span>Швидкість:</span>
            </div>
            <div className="font-bold text-white">
              {Math.round(target.speed_kmh)} км/год
              {isBallistic && <span className="text-[10px] text-rose-400 ml-1">(Mach 6)</span>}
            </div>
          </div>

          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="flex items-center space-x-1 text-slate-400 mb-0.5">
              <Navigation className="w-3 h-3 text-emerald-400" />
              <span>Курс (Азимут):</span>
            </div>
            <div className="font-bold text-white">{target.bearing}°</div>
          </div>
        </div>

        {/* Route Details */}
        <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-1 text-slate-400">
              <MapPin className="w-3 h-3 text-rose-400" />
              <span>Точка пуску:</span>
            </span>
            <span className="font-bold text-white text-right">{target.origin.name}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-1 text-slate-400">
              <MapPin className="w-3 h-3 text-emerald-400" />
              <span>Цільовий сектор:</span>
            </span>
            <span className="font-bold text-amber-300 text-right">{target.destination.name}</span>
          </div>
        </div>

        {/* Source citation */}
        <div className="text-[10px] text-slate-400 flex items-center space-x-1 pt-1 border-t border-slate-800/80">
          <Radio className="w-3 h-3 text-sky-400 shrink-0" />
          <span>Джерело: <b className="text-sky-300">{target.source_channel}</b></span>
        </div>
      </div>
    </div>
  );
};
