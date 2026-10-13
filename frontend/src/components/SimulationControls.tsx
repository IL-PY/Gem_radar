import React, { useState } from 'react';
import { Play, Trash2, Send, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

interface SimulationControlsProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulate: (scenario: 'ballistic' | 'shahed' | 'cruise' | 'kab' | 'jetshahed') => void;
  onSimulateCustom: (text: string) => void;
  onClear: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isOpen,
  onClose,
  onSimulate,
  onSimulateCustom,
  onClear,
}) => {
  const [customText, setCustomText] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    onSimulateCustom(customText);
    setCustomText('');
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[540px] max-w-[calc(100vw-32px)] bg-gradient-to-b from-slate-900/95 to-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden font-mono text-slate-200">
      {/* Bar Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-r from-amber-500/15 to-transparent border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-bold text-amber-200 uppercase tracking-[0.12em]">
            Панель тактичної симуляції (Тест траєкторій)
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10"
          >
            Закрити
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-2.5">
          {/* Quick Trigger Buttons */}
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={() => onSimulate('ballistic')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2.5 rounded-lg bg-gradient-to-b from-rose-600/30 to-rose-950/60 hover:from-rose-500/40 hover:to-rose-900/60 border border-rose-400/50 text-rose-100 text-xs font-bold transition-all shadow-[0_0_12px_rgba(244,63,94,0.2)] active:scale-95"
            >
              <Play className="w-3 h-3 text-rose-300" />
              <span>Іскандер-М</span>
            </button>

            <button
              onClick={() => onSimulate('shahed')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2.5 rounded-lg bg-gradient-to-b from-amber-500/25 to-amber-950/60 hover:from-amber-400/35 hover:to-amber-900/60 border border-amber-400/50 text-amber-100 text-xs font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.2)] active:scale-95"
            >
              <Play className="w-3 h-3 text-amber-300" />
              <span>Шахеди</span>
            </button>

            <button
              onClick={() => onSimulate('cruise')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2.5 rounded-lg bg-gradient-to-b from-sky-500/25 to-sky-950/60 hover:from-sky-400/35 hover:to-sky-900/60 border border-sky-400/50 text-sky-100 text-xs font-bold transition-all shadow-[0_0_12px_rgba(56,189,248,0.2)] active:scale-95"
            >
              <Play className="w-3 h-3 text-sky-300" />
              <span>Калібр</span>
            </button>

            <button
              onClick={() => onSimulate('kab')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2.5 rounded-lg bg-gradient-to-b from-orange-500/25 to-orange-950/60 hover:from-orange-400/35 hover:to-orange-900/60 border border-orange-400/50 text-orange-100 text-xs font-bold transition-all shadow-[0_0_12px_rgba(251,146,60,0.2)] active:scale-95"
            >
              <Play className="w-3 h-3 text-orange-300" />
              <span>КАБ</span>
            </button>

            <button
              onClick={() => onSimulate('jetshahed')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2.5 rounded-lg bg-gradient-to-b from-violet-500/25 to-violet-950/60 hover:from-violet-400/35 hover:to-violet-900/60 border border-violet-400/50 text-violet-100 text-xs font-bold transition-all shadow-[0_0_12px_rgba(167,139,250,0.2)] active:scale-95"
            >
              <Play className="w-3 h-3 text-violet-300" />
              <span>Shahed-238</span>
            </button>
          </div>

          {/* Custom Message Parser Input */}
          <form onSubmit={handleCustomSubmit} className="flex items-center space-x-2 pt-2.5 border-t border-white/10">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Введіть текст тривоги (напр. 'Пуск балістики з Криму на Одесу')"
              className="flex-1 px-3 py-2 bg-black/60 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] font-sans"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-gradient-to-b from-sky-500 to-sky-700 hover:from-sky-400 hover:to-sky-600 text-white text-xs font-bold transition-all shadow-[0_0_14px_rgba(56,189,248,0.35)] flex items-center space-x-1"
            >
              <Send className="w-3 h-3" />
              <span className="hidden sm:inline">Спарсити</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-rose-950/60 border border-white/10 hover:border-rose-400/60 text-slate-400 hover:text-rose-300 transition-all"
              title="Очистити всі цілі"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
