import React from 'react';
import { X, Send, Radio, Info, Crosshair } from 'lucide-react';
import type { TelegramAlert, SystemStatus } from '../types';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: TelegramAlert[];
  systemStatus: SystemStatus | null;
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  isOpen,
  onClose,
  alerts,
  systemStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-14 right-4 bottom-4 w-96 max-w-[calc(100vw-32px)] z-30 flex flex-col bg-gradient-to-b from-slate-900/95 to-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden font-sans text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-sky-500/15 to-transparent border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Send className="w-4 h-4 text-sky-400" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-white">
            Оперативне зведення з Telegram
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Monitored Channels Status */}
      <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/10 text-[11px] font-mono">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="flex items-center space-x-1.5">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="font-semibold tracking-wide">Канали моніторингу:</span>
          </span>
          <span className="text-emerald-300 font-bold tabular-nums">
            {systemStatus?.monitored_channels.length || 6} активних
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(systemStatus?.monitored_channels || [
            'kpszsu',
            'vanek_nikolaev',
            'monitorwar',
            'war_monitor',
            'air_alert_ua',
          ]).map((ch) => (
            <span
              key={ch}
              className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 text-[10px] font-semibold border border-sky-400/25"
            >
              @{ch}
            </span>
          ))}
        </div>
      </div>

      {/* Session notice if no telegram connected */}
      {!systemStatus?.telegram_connected && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-gradient-to-br from-sky-500/15 to-transparent border border-sky-400/30 text-[11px] text-sky-200 flex items-start space-x-2">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <div className="font-bold text-sky-200">Підключення власної .session:</div>
            Покладіть файл <code className="text-amber-300">radar_session.session</code> у папку <code className="text-amber-300">backend/</code> та вкажіть API_ID і API_HASH у файлі <code className="text-amber-300">.env</code>.
          </div>
        </div>
      )}

      {/* Alerts Feed List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {alerts.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs font-mono">
            Очікування нових повідомлень від моніторингових каналів...
          </div>
        ) : (
          alerts.map((alert) => {
            const timeStr = new Date(alert.timestamp * 1000).toLocaleTimeString();
            const isBallistic = alert.threat_type === 'BALLISTIC';
            const isShahed = alert.threat_type === 'SHAHED' || alert.threat_type === 'JET_SHAHED';

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border text-xs transition-all ${
                  isBallistic
                    ? 'bg-gradient-to-br from-rose-600/20 to-transparent border-rose-400/40 shadow-[0_0_16px_rgba(244,63,94,0.15)]'
                    : isShahed
                    ? 'bg-gradient-to-br from-amber-500/15 to-transparent border-amber-400/35'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-sky-300">
                    {alert.channel}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    {timeStr}
                  </span>
                </div>
                <p className="text-slate-100 leading-relaxed font-sans select-text">
                  {alert.text}
                </p>
                {alert.threat_type && (
                  <div className="mt-2 flex items-center space-x-2">
                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md border ${
                        isBallistic
                          ? 'bg-rose-500/15 text-rose-200 border-rose-400/50'
                          : isShahed
                          ? 'bg-amber-500/15 text-amber-200 border-amber-400/50'
                          : 'bg-sky-500/15 text-sky-200 border-sky-400/50'
                      }`}
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>{alert.threat_type}</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Траєкторію побудовано на карті
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
