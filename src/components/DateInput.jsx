import React, { useState, useEffect } from "react";

/**
 * Компонент ввода даты с маской.
 * Пользователь вводит ДД.ММ.ГГ (или просто цифры ДДММГГ, точки ставятся сами),
 * а наружу (в onChange) отдается валидный ISO-формат YYYY-MM-DD.
 */
export const DateInput = ({ value, onChange, placeholder, style, className }) => {
  // Конвертирует YYYY-MM-DD из базы в читаемый ДД.ММ.ГГ для отображения
  const toDisplay = v => {
    if (!v) return "";
    const [y, m, d] = v.split("-");
    if (!y || !m || !d) return v;
    return `${d}.${m}.${y.slice(2)}`;
  };

  // Конвертирует введенный текст ДД.ММ.ГГ обратно в YYYY-MM-DD для сохранения в базу
  const toISO = raw => {
    const cleaned = raw.replace(/[^0-9.]/g, ""); // Выпиливаем всё, кроме цифр и точек
    const parts = cleaned.split(".");
    if (parts.length === 3) {
      const [d, m, yy] = parts;
      // Проверяем, что введены корректные длины (2 символа на день, месяц и год)
      if (d.length === 2 && m.length === 2 && yy.length === 2) {
        const year = "20" + yy; // Жестко привязываем к 2000-м годам
        const iso = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        // Проверяем, существует ли такая дата в реальности (чтобы не было 32.13.20)
        if (!isNaN(new Date(iso))) return iso;
      }
    }
    return null;
  };

  const [display, setDisplay] = useState(toDisplay(value));
  const [error, setError] = useState(false);

  // Синхронизируем локальный стейт, если значение прилетело снаружи (например, при редактировании заказа)
  useEffect(() => { setDisplay(toDisplay(value)); }, [value]);

  // Обработчик ввода пользователя
  const handleChange = e => {
    let v = e.target.value;
    const digits = v.replace(/\D/g, ""); // Оставляем только голые цифры для маски
    
    // Автоматическая подстановка точек
    if (digits.length <= 2) v = digits;
    else if (digits.length <= 4) v = digits.slice(0, 2) + "." + digits.slice(2);
    else v = digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4, 6);
    
    setDisplay(v);
    
    // Если введено ровно 8 символов (ДД.ММ.ГГ) — пытаемся парсить
    if (v.length === 8) {
      const iso = toISO(v);
      if (iso) { 
        setError(false); 
        onChange({ target: { value: iso } }); // Отправляем наверх валидную дату
      } else {
        setError(true); // Дата кривая — подсвечиваем красным
      }
    } else if (v.length === 0) {
      // Поле очистили — сбрасываем ошибку и отправляем пустую строку
      setError(false); 
      onChange({ target: { value: "" } });
    } else {
      // В процессе ввода ошибок не показываем
      setError(false);
    }
  };

  return (
    <input
      value={display}
      onChange={handleChange}
      placeholder={placeholder || "ДД.ММ.ГГ"}
      maxLength={8}
      // Если есть ошибка, накидываем красные стили поверх базовых
      style={{ ...style, ...(error ? { borderColor: "var(--red)", background: "var(--red-bg)" } : {}) }}
      className={`w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all ${className || ''}`}
    />
  );
};

export default DateInput;