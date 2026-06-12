import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

// Глобальный статус сохранения (оставляем для обратной совместимости с UI)
const notifySaveStatus = (state, msg = '') => {
  window._saveStatus = { state, msg };
  (window._saveListeners || []).forEach(fn => { 
    try { fn(state, msg); } catch(e) {} 
  });
};

export const useStorage = (key, def) => {
  const [val, setVal] = useState(def);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    // Если идет сохранение - не перезаписываем данные, чтобы избежать "гонки состояний"
    if ((window._savingCount || 0) > 0) return; 
    
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('key', key)
        .maybeSingle(); // Используем maybeSingle, чтобы не бросало ошибку, если ключа еще нет
        
      if (error) throw error;
      if (data && data.data) {
        setVal(data.data);
      }
    } catch(e) { 
      console.error(`[useStorage] Ошибка загрузки ${key}:`, e); 
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const save = useCallback(async (v) => {
    setVal(v); // Сразу обновляем UI (Optimistic UI)
    window._savingCount = (window._savingCount || 0) + 1;
    window._isSaving = true;
    notifySaveStatus('saving');
    
    let hadError = false;
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key, data: v }, { onConflict: 'key' });
        
      if (error) throw error;
    } catch(e) {
      hadError = true;
      console.error(`[useStorage] Ошибка сохранения ${key}:`, e);
      notifySaveStatus('error', e.message);
    } finally {
      window._savingCount = Math.max(0, (window._savingCount || 1) - 1);
      window._isSaving = window._savingCount > 0;
      
      if (!hadError && window._saveStatus?.state !== 'error') {
        notifySaveStatus('ok');
        setTimeout(() => { 
          if (window._saveStatus?.state === 'ok') notifySaveStatus('idle'); 
        }, 3000);
      }
    }
  }, [key]);

  return [val, save, loaded];
};

export default useStorage;