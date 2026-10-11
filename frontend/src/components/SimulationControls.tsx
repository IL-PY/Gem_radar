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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[540px] max-w-[calc(100vw-32px)] bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-slate-200">
      {/* Bar Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
            Панель тактичної симуляції (Тест траєкторій)
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-800"
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
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2 rounded bg-rose-950/70 hover:bg-rose-900/80 border border-rose-600/70 text-rose-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 text-rose-400" />
              <span>Іскандер-М</span>
            </button>

            <button
              onClick={() => onSimulate('shahed')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2 rounded bg-amber-950/70 hover:bg-amber-900/80 border border-amber-600/70 text-amber-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 text-amber-400" />
              <span>Шахеди</span>
            </button>

            <button
              onClick={() => onSimulate('cruise')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2 rounded bg-sky-950/70 hover:bg-sky-900/80 border border-sky-600/70 text-sky-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 text-sky-400" />
              <span>Калібр</span>
            </button>

            <button
              onClick={() => onSimulate('kab')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2 rounded bg-orange-950/70 hover:bg-orange-900/80 border border-orange-600/70 text-orange-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 text-orange-400" />
              <span>КАБ</span>
            </button>

            <button
              onClick={() => onSimulate('jetshahed')}
              className="flex items-center justify-center space-x-1.5 px-2.5 py-2 rounded bg-violet-950/70 hover:bg-violet-900/80 border border-violet-600/70 text-violet-200 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 text-violet-400" />
              <span>Shahed-238</span>
            </button>
          </div>

          {/* Custom Message Parser Input */}
          <form onSubmit={handleCustomSubmit} className="flex items-center space-x-2 pt-1 border-t border-slate-800">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Введіть текст тривоги (напр. 'Пуск балістики з Криму на Одесу')"
              className="flex-1 px-3 py-1.5 bg-black/60 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-sans"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors flex items-center space-x-1"
            >
              <Send className="w-3 h-3" />
              <span className="hidden sm:inline">Спарсити</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 rounded bg-slate-900 hover:bg-rose-950/70 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-300 transition-colors"
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
