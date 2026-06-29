import React, { useState, useMemo, useEffect } from "react";
import { normPhone, phonesMatch } from "../utils/helpers";

/**
 * Умный поиск клиентов по истории заказов и ремонтов.
 * Предотвращает создание дублей: ищет совпадения по мере ввода имени или телефона.
 * Если номер уже есть в базе под другим именем, выдает предупреждение.
 */
export const ClientSearch = ({ clientName, clientPhone, clientEmail, onSelect, allHistory }) => {
  // Стейты для выпадающих списков и введенных значений
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [phoneSuggestions, setPhoneSuggestions] = useState([]);
  const [nameInput, setNameInput] = useState(clientName || "");
  const [phoneInput, setPhoneInput] = useState(clientPhone || "");
  const [emailInput, setEmailInput] = useState(clientEmail || "");
  const [showNameDrop, setShowNameDrop] = useState(false);
  const [showPhoneDrop, setShowPhoneDrop] = useState(false);

  // Синхронизация полей при загрузке готового заказа на редактирование
  useEffect(() => {
    setNameInput(clientName || "");
    setPhoneInput(clientPhone || "");
    setEmailInput(clientEmail || "");
  }, [clientName, clientPhone, clientEmail]);

  // Агрегируем всю историю (заказы, ремонты, CNC) в уникальный справочник клиентов
  const clientMap = useMemo(() => {
    const m = {};
    (allHistory || []).forEach(o => {
      const phone = o.clientPhone || o.clientId || "";
      const name = o.clientName || "";
      const email = o.clientEmail || "";
      
      // Ключом уникальности выступает очищенный телефон или имя (если телефона нет)
      const key = normPhone(phone) || name;
      if (!key) return;
      
      if (!m[key]) m[key] = { name, phone, email };
      // Если нашли более полные данные в другом заказе — дописываем
      if (name && !m[key].name) m[key].name = name;
      if (email && !m[key].email) m[key].email = email;
    });
    // Возвращаем массив уникальных клиентов для поиска
    return Object.values(m).filter(c => c.name || c.phone);
  }, [allHistory]);

  // Обработка ввода имени
  const handleNameChange = v => {
    setNameInput(v);
    onSelect({ clientName: v, clientPhone: phoneInput, clientEmail: emailInput });
    
    // Начинаем искать совпадения от 2 символов
    if (v.length >= 2) {
      const q = v.toLowerCase();
      // Ищем частичное совпадение имени, исключая полное совпадение (чтобы не показывать выпадашку, если имя уже введено полностью)
      const matches = clientMap.filter(c => c.name && c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q);
      setNameSuggestions(matches.slice(0, 5)); // Берем топ 5 результатов
      setShowNameDrop(matches.length > 0);
    } else {
      setNameSuggestions([]); 
      setShowNameDrop(false);
    }
  };

  // Обработка ввода телефона
  const handlePhoneChange = v => {
    setPhoneInput(v);
    const norm = normPhone(v);
    
    // Ищем точное совпадение по номеру телефона
    const exact = clientMap.find(c => phonesMatch(c.phone, v));
    
    if (exact) {
      const newName = nameInput || exact.name;
      const nameDiffers = nameInput && exact.name && nameInput.toLowerCase() !== exact.name.toLowerCase();
      // Если точное совпадение есть, но имя отличается — сохраняем то, что ввел юзер, но передаем флаг отличия
      setNameInput(nameDiffers ? nameInput : (newName || nameInput));
      onSelect({ clientName: nameDiffers ? nameInput : (newName || nameInput), clientPhone: v, clientEmail: emailInput || exact.email || "" });
    } else {
      onSelect({ clientName: nameInput, clientPhone: v, clientEmail: emailInput });
    }
    
    // Выдаем подсказки при вводе хотя бы 3 цифр
    if (norm.length >= 3) {
      const matches = clientMap.filter(c => normPhone(c.phone).includes(norm) && !phonesMatch(c.phone, v));
      setPhoneSuggestions(matches.slice(0, 5));
      setShowPhoneDrop(matches.length > 0 && !exact); // Прячем выпадашку, если уже есть 100% совпадение
    } else {
      setPhoneSuggestions([]); 
      setShowPhoneDrop(false);
    }
  };

  // Пользователь кликнул на подсказку в выпадающем списке
  const pickClient = c => {
    setNameInput(c.name || ""); 
    setPhoneInput(c.phone || ""); 
    setEmailInput(c.email || "");
    setShowNameDrop(false); 
    setShowPhoneDrop(false);
    onSelect({ clientName: c.name || "", clientPhone: c.phone || "", clientEmail: c.email || "" });
  };

  // Проверяем, есть ли коллизия: телефон совпал, но юзер ввел другое имя
  const existingByPhone = phoneInput ? clientMap.find(c => phonesMatch(c.phone, phoneInput)) : null;
  const nameDiffers = existingByPhone && nameInput && existingByPhone.name && nameInput.toLowerCase().trim() !== existingByPhone.name.toLowerCase().trim();

  // Рендер элемента выпадающего списка
  const dropItem = (c, i) => (
    <div key={i} onMouseDown={() => pickClient(c)} className="px-3 py-2 cursor-pointer border-b border-slate-100 text-xs flex justify-between items-center hover:bg-slate-50">
      <span className="font-semibold text-slate-800">{c.name || "—"}</span>
      <span className="text-slate-400">{c.phone}</span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Инпут Имени */}
        <div className="relative">
          <input 
            placeholder="Имя клиента" 
            value={nameInput} 
            onChange={e => handleNameChange(e.target.value)} 
            onBlur={() => setTimeout(() => setShowNameDrop(false), 200)} // Таймаут нужен, чтобы успел сработать клик по выпадашке
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
          />
          {showNameDrop && <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">{nameSuggestions.map((c, i) => dropItem(c, i))}</div>}
        </div>
        
        {/* Инпут Телефона */}
        <div className="relative">
          <input 
            placeholder="+372..." 
            value={phoneInput} 
            onChange={e => handlePhoneChange(e.target.value)} 
            onBlur={() => setTimeout(() => setShowPhoneDrop(false), 200)} 
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
          />
          {showPhoneDrop && <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">{phoneSuggestions.map((c, i) => dropItem(c, i))}</div>}
        </div>
      </div>
      
      {/* Предупреждение о дубле (коллизия имен для одного номера) */}
      {nameDiffers && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700 flex justify-between items-center gap-2">
          <span>⚠ Этот телефон в базе как <strong>{existingByPhone.name}</strong> — другое написание?</span>
          <button 
            type="button" 
            className="shrink-0 bg-white border border-amber-300 px-2 py-1 rounded text-amber-700 font-semibold hover:bg-amber-100 transition-colors" 
            onMouseDown={() => { 
              setNameInput(existingByPhone.name); 
              onSelect({ clientName: existingByPhone.name, clientPhone: phoneInput, clientEmail: emailInput || existingByPhone.email || "" }); 
            }}
          >
            Использовать "{existingByPhone.name}"
          </button>
        </div>
      )}
      
      {/* Инпут E-mail */}
      <div className="mt-4">
        <input 
          type="email" 
          placeholder="E-mail (необязательно)" 
          value={emailInput} 
          onChange={e => { setEmailInput(e.target.value); onSelect({ clientName: nameInput, clientPhone: phoneInput, clientEmail: e.target.value }); }} 
          className="w-full md:w-1/2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
        />
      </div>
    </>
  );
};

export default ClientSearch;