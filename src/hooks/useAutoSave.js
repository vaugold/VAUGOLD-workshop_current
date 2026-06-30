// src/hooks/useAutoSave.js
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Проверяет, есть ли в данных какие-либо заполненные поля
 * @param {object} data - данные формы
 * @returns {boolean} true если данные не пустые
 */
const hasAnyData = (data) => {
  if (!data || typeof data !== 'object') return false;

  // Проверяем ключевые поля формы (исключая orderNumber - он генерируется автоматически)
  const importantFields = ['clientName', 'clientPhone', 'clientEmail', 'orderTitle', 'serviceType', 'source'];
  for (const field of importantFields) {
    if (data[field] && String(data[field]).trim() !== '') return true;
  }

  // Проверяем массивы (например items, stages)
  if (Array.isArray(data.items) && data.items.length > 0) {
    for (const item of data.items) {
      if (item && (item.type || item.price || item.comment || item.masterTask)) return true;
    }
  }
  if (Array.isArray(data.stages) && data.stages.length > 0) {
    for (const stage of data.stages) {
      if (stage && stage.cost === '') continue;
      if (stage && (stage.cost || (Array.isArray(stage.rows) && stage.rows.some(r => r.cost)))) return true;
    }
  }
  if (Array.isArray(data.extras) && data.extras.length > 0) {
    for (const extra of data.extras) {
      if (extra && (extra.description || extra.price)) return true;
    }
  }

  return false;
};

/**
 * Простой хук автосохранения в localStorage
 * @param {string} draftKey - уникальный ключ для черновика
 * @param {function} getInitialData - функция для получения начальных данных
 * @param {function} hasData - функция для проверки наличия данных (опционально)
 */
export const useAutoSave = (draftKey, getInitialData, hasData = hasAnyData) => {
  const key = `ws_draft_${draftKey}`;
  const [draft, setDraft] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  // Флаг "паузы" - после очистки не сохраняем, пока не перезагрузится страница
  const isCleared = useRef(false);

  // Загрузка черновика при старте
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraft(parsed.data);
        setLastSaved(new Date(parsed.timestamp));
        setShowBanner(true);
        isCleared.current = false;
      }
    } catch (e) {
      console.error('[useAutoSave] Ошибка загрузки:', e);
    }
  }, [key]);

  // Сохранение (не работает если черновик был очищен)
  const save = useCallback((data) => {
    // Не сохраняем если был очищен
    if (isCleared.current) return;

    // Не сохраняем если данных нет (пустая форма)
    if (!hasData(data)) return;

    // Сохраняем в localStorage
    const toSave = { data, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(toSave));
    setDraft(data);
    setLastSaved(new Date());
  }, [key, hasData]);

  // Очистка черновика
  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setDraft(null);
    setLastSaved(null);
    setShowBanner(false);
    isCleared.current = true; // Ставим флаг паузы
  }, [key]);

  return { draft, save, lastSaved, showBanner, setShowBanner, clear };
};
