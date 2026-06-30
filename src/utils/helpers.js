// src/utils/helpers.js

// --- ФОРМАТИРОВАНИЕ ДАТ ---
export const todayStr = () => new Date().toISOString().split("T")[0];

export const fmtDate = d => d ? new Date(d+"T00:00:00").toLocaleDateString("ru-RU", {day:"2-digit",month:"2-digit",year:"2-digit"}) : "—";

export const mKey = d => d ? d.slice(0,7) : "";

export const mLabel = k => {
  if (!k) return "—";
  const [y,m] = k.split("-");
  return ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][parseInt(m)-1]+" "+y;
};

// Расчет рабочих дней (пропуск выходных) для дедлайнов ремонтов
export const addWorkdays = (dateStr, days) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr||"";
  const d = new Date(dateStr+"T12:00:00");
  if (isNaN(d.getTime())) return dateStr;
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate()+1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().split("T")[0];
};

// --- ФОРМАТИРОВАНИЕ ВАЛЮТЫ ---
export const fmt = n => "€"+(parseFloat(n)||0).toFixed(2);

// --- РАБОТА С ТЕЛЕФОНАМИ ---
// Очистка телефона от мусора (+372, пробелы, скобки) для точного поиска
export const normPhone = p => {
  if (!p) return "";
  const digits = p.replace(/\D/g,"");
  if (digits.startsWith("372") && digits.length > 7) return digits.slice(3);
  return digits;
};

// Сравнение двух телефонов
export const phonesMatch = (a, b) => {
  const na = normPhone(a); 
  const nb = normPhone(b);
  return na && nb && na === nb;
};

// --- РАБОТА СО СТАТУСАМИ ---
export const oStatus = o => o.status || (o.completionDate ? "Изделие изготовлено" : "В работе");

export const isDone = s => s==="Изделие изготовлено" || s==="Выдано" || s==="Завершено";

/**
 * Безопасное приведение значения к числу.
 * Если в поле пусто, null или ломаный текст — возвращает 0 вместо NaN.
 */
export const safeNum = (val) => {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

/**
 * Генератор уникальных текстовых ID для новых локальных записей.
 * Создает легкий уникальный хеш на основе времени и случайных чисел.
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
};

/**
 * Генерация номера заказа/ремонта по шаблону:
 * {PREFIX}{YYMMDD}{SEQUENCE}
 * - VG = Администратор/Суперпользователь
 * - EM = Мастер Sikupilli
 * - OM = Мастер Vaugold (ИСПРАВЛЕНО 2026-06-27: новый мастер на точке Vaugold)
 * Пример: VG26052601, EM26052602, OM26052601
 *
 * @param {Array} existingOrders - список существующих заказов/ремонтов
 * @param {string} userRole - роль пользователя ('superuser' | 'master_sikupilli' | 'master_vaugold')
 * @returns {string} - сгенерированный номер заказа
 */
export const generateOrderNumber = (existingOrders = [], userRole = 'superuser') => {
  // ИСПРАВЛЕНО 2026-06-27: добавлен префикс OM для нового мастера на точке Vaugold
  let prefix = 'VG';
  if (userRole === 'master_sikupilli') prefix = 'EM';
  else if (userRole === 'master_vaugold') prefix = 'OM';

  // Текущая дата в формате YYMMDD
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  // Фильтруем существующие заказы с таким же префиксом и датой
  const todayPrefix = `${prefix}${dateStr}`;
  const todayOrders = existingOrders.filter(o =>
    o.orderNumber && o.orderNumber.startsWith(todayPrefix)
  );

  // Находим максимальный порядковый номер
  let maxSeq = 0;
  todayOrders.forEach(o => {
    const seqStr = o.orderNumber.slice(-2); // Последние 2 цифры
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  });

  // Генерируем новый номер
  const nextSeq = String(maxSeq + 1).padStart(2, '0');
  return `${todayPrefix}${nextSeq}`;
};