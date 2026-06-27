// src/hooks/useStorage.js
// Хук для работы с данными CRM. Под капутом использует dataAdapter, который маршрутизирует
// запросы к новым таблицам Supabase (orders, repairs, clients и т.д.) или к старой таблице settings
// для ключей без новой структуры.
//
// ИСПРАВЛЕНО 2026-06-27: убран 30-секундный polling — он качал по 40 MB каждые 30 сек даже когда
// данные не менялись. Вместо polling — ручной reload() и подписка на изменения в WorkshopTracker.
// API не изменилось: const [value, saveValue, loaded, reload] = useStorage(key, defaultValue);

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadRaw, saveRaw } from '../services/dataAdapter';

// Глобальный статус сохранения (оставляем для обратной совместимости с UI)
const notifySaveStatus = (state, msg = '') => {
  window._saveStatus = { state, msg };
  (window._saveListeners || []).forEach(fn => {
    try { fn(state, msg); } catch (e) {}
  });
};

export const useStorage = (key, def) => {
  const [val, setVal] = useState(def);
  const [loaded, setLoaded] = useState(false);
  // Защита от гонок при ручном reload во время save
  const isLoadingRef = useRef(false);

  const load = useCallback(async (force = false) => {
    // Не перезаписываем state во время сохранения (защита от гонок)
    if (!force && (window._savingCount || 0) > 0) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const data = await loadRaw(key, def);
      setVal(data);
    } catch (e) {
      console.error(`[useStorage] Ошибка загрузки ${key}:`, e);
    } finally {
      isLoadingRef.current = false;
    }
    setLoaded(true);
  }, [key]);

  // Загружаем ОДИН РАЗ при монтировании (polling убран)
  useEffect(() => {
    load();
  }, [load]);

  // Ручной reload — вызывается из WorkshopTracker после сохранения или по кнопке "Обновить"
  const reload = useCallback(() => load(true), [load]);

  const save = useCallback(async (v) => {
    setVal(v); // Сразу обновляем UI (Optimistic UI)
    window._savingCount = (window._savingCount || 0) + 1;
    window._isSaving = true;
    notifySaveStatus('saving');

    let hadError = false;
    try {
      const saved = await saveRaw(key, v);
      // Если saveRaw вернул обновлённый массив (с реальными ID из БД) — обновим state
      if (Array.isArray(saved) || (saved && typeof saved === 'object')) {
        setVal(saved);
      }

      if (!hadError && window._saveStatus?.state !== 'error') {
        notifySaveStatus('ok');
        setTimeout(() => {
          if (window._saveStatus?.state === 'ok') notifySaveStatus('idle');
        }, 3000);
      }
    } catch (e) {
      hadError = true;
      console.error(`[useStorage] Ошибка сохранения ${key}:`, e);
      notifySaveStatus('error', e.message);
    } finally {
      window._savingCount = Math.max(0, (window._savingCount || 1) - 1);
      window._isSaving = window._savingCount > 0;
    }
  }, [key]);

  return [val, save, loaded, reload];
};

export default useStorage;