import { createClient } from '@supabase/supabase-js';

// Автоматически подтягиваем переменные окружения для Vite или Create React App
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env?.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env?.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(' КРИТИЧЕСКАЯ ОШИБКА: Переменные окружения Supabase не найдены! Проверь файл .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);