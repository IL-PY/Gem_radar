import React from 'react';
import { X, Send, Radio, Info } from 'lucide-react';
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
    <div className="absolute top-14 right-4 bottom-4 w-96 max-w-[calc(100vw-32px)] z-30 flex flex-col bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-sans text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Send className="w-4 h-4 text-sky-400" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
            Оперативне зведення з Telegram
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Monitored Channels Status */}
      <div className="px-4 py-2.5 bg-slate-900/40 border-b border-slate-800 text-[11px] font-mono">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="flex items-center space-x-1">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span>Канали моніторингу:</span>
          </span>
          <span className="text-emerald-400 font-bold">
            {systemStatus?.monitored_channels.length || 6} активних
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(systemStatus?.monitored_channels || [
            'kpszsu',
            'vanek_nikolaev',
            'monitorwar',
            'war_monitor',
            'air_alert_ua',
          ]).map((ch) => (
            <span
              key={ch}
              className="px-1.5 py-0.5 rounded bg-slate-800/80 text-sky-300 text-[10px] border border-slate-700"
            >
              @{ch}
            </span>
          ))}
        </div>
      </div>

      {/* Session notice if no telegram connected */}
      {!systemStatus?.telegram_connected && (
        <div className="mx-3 mt-3 p-2.5 rounded bg-sky-950/40 border border-sky-800/60 text-[11px] text-sky-200 flex items-start space-x-2">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <div className="font-bold text-sky-300">Підключення власної .session:</div>
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
                className={`p-3 rounded-lg border text-xs transition-all ${
                  isBallistic
                    ? 'bg-rose-950/30 border-rose-800/70 shadow-sm shadow-rose-900/20'
                    : isShahed
                    ? 'bg-amber-950/20 border-amber-800/60'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-sky-400">
                    {alert.channel}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {timeStr}
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed font-sans select-text">
                  {alert.text}
                </p>
                {alert.threat_type && (
                  <div className="mt-2 flex items-center space-x-2">
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded ${
                        isBallistic
                          ? 'bg-rose-900/80 text-rose-200 border border-rose-600'
                          : isShahed
                          ? 'bg-amber-900/80 text-amber-200 border border-amber-600'
                          : 'bg-sky-900/80 text-sky-200 border border-sky-600'
                      }`}
                    >
                      🎯 {alert.threat_type}
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
