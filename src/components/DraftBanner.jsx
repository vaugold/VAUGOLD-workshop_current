// src/components/DraftBanner.jsx
import React from 'react';

const DraftBanner = ({ show, lastSaved, onClear, onDismiss }) => {
  if (!show) return null;

  const formatTime = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Затемняющий оверлей - клик только по кнопкам */}
      <div className="fixed inset-0 bg-slate-900/60 z-40" />

      {/* МОДАЛЬНОЕ ОКНО - нельзя закрыть по клику вне */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-bounce-in">
          {/* Иконка и заголовок */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Черновик восстановлен</h3>
            <p className="text-sm text-slate-500">
              Мы нашли несохранённые данные от {lastSaved && `${formatTime(lastSaved)}`}
            </p>
          </div>

          {/* Кнопки действий */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onDismiss}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98]"
            >
              Продолжить работу с черновиком
            </button>
            <button
              onClick={onClear}
              className="w-full py-3 px-4 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              Начать с чистого листа
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce-in {
          0% { opacity: 0; transform: scale(0.9) translateY(20px); }
          50% { transform: scale(1.02) translateY(-5px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-bounce-in {
          animation: bounce-in 0.4s ease-out forwards;
        }
      `}</style>
    </>
  );
};

export default DraftBanner;
