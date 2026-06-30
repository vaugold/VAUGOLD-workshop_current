// src/components/SaveStatus.jsx
import React, { useState, useEffect } from 'react';

/**
 * Индикатор синхронизации данных с Supabase в реальном времени.
 * Отслеживает состояние сохранения, чтобы ювелир всегда видел, улетели ли изменения на сервер
 * или сеть оборвалась и закрывать вкладку пока нельзя.
 */
export const SaveStatus = () => {
  const [status, setStatus] = useState({ state: 'idle', msg: '' });

  useEffect(() => {
    // Функция-слушатель изменений статуса из нашего хука useStorage
    const handleStatusChange = (state, msg) => {
      setStatus({ state, msg });
    };

    // Инициализируем глобальный массив слушателей, если его еще нет
    if (!window._saveListeners) {
      window._saveListeners = [];
    }
    
    // Добавляем текущий компонент в список тех, кто хочет знать статус сохранения
    window._saveListeners.push(handleStatusChange);

    // Подтягиваем текущее состояние при монтировании
    if (window._saveStatus) {
      setStatus(window._saveStatus);
    }

    // Чистим за собой при размонтировании страницы, чтобы не было утечек памяти
    return () => {
      window._saveListeners = window._saveListeners.filter(fn => fn !== handleStatusChange);
    };
  }, []);

  // Если система ничего не делает - прячем компонент, чтобы не мозолил глаза
  if (status.state === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[999] flex items-center space-x-2 px-3 py-2 rounded-lg shadow-lg text-xs font-medium transition-all duration-300">
      
      {/* Состояние 1: Идет процесс отправки пакетов данных */}
      {status.state === 'saving' && (
        <div className="bg-blue-600 text-white flex items-center p-2 rounded-md">
          {/* Простая CSS-анимация крутилки (спиннера) */}
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Синхронизация с базой...
        </div>
      )}

      {/* Состояние 2: Все успешно легло в таблицу settings */}
      {status.state === 'ok' && (
        <div className="bg-emerald-600 text-white flex items-center p-2 rounded-md animate-fade-in">
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Данные сохранены
        </div>
      )}

      {/* Состояние 3: Ошибка сервера (например, таймаут 522 или 500 из-за тяжелого JSON) */}
      {status.state === 'error' && (
        <div className="bg-rose-600 text-white flex items-center p-2 rounded-md animate-bounce">
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Ошибка сети: {status.msg || 'Потеряно соединение'}
        </div>
      )}
      
    </div>
  );
};

export default SaveStatus;