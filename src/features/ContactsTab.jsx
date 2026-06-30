// src/features/ContactsTab.jsx
import React, { useState, useMemo } from 'react';
import { normPhone, fmt, fmtDate, mLabel } from '../utils/helpers';
import { calcOrder, calcCNC } from '../utils/calculations';
import DateInput from '../components/DateInput';

/**
 * Сквозной модуль CRM для агрегации уникальной базы контрагентов.
 * Объединяет сущности из Заказов, Ремонтов и CNC по очищенному номеру телефона или ФИО,
 * высчитывая суммарный финансовый вклад каждого клиента (LTV) и показывая статистику.
 * Усилен защитой от "грязных" данных из старой базы (optional chaining).
 */
export const ContactsTab = ({ orders = [], repairs = [], cncOrders = [], setOrders }) => {
  // Стейты навигации и фильтров
  const [subTab, setSubTab] = useState("all");
  const [search, setSearch] = useState("");
  const [editingContact, setEditingContact] = useState(null);
  const [expanded, setExpanded] = useState(null);
  
  // Стейты периодов для блока статистики
  const [periodType, setPeriodType] = useState("all");
  const [selYear, setSelYear] = useState(String(new Date().getFullYear()));
  const [selMonth, setSelMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // --- СУПЕР-АГРЕГАЦИЯ БАЗЫ КЛИЕНТОВ (ЗАЩИЩЕНА ОТ КРИВЫХ ДАННЫХ) ---
  const allContacts = useMemo(() => {
    const map = Object.create(null); // Защита от prototype pollution
    
    const upsert = (phone, name, entry, email) => {
      const key = normPhone(phone || name || "?") || (name || "?");
      if (!map[key]) {
        map[key] = { key, name: name || "", phone: phone || "", email: email || "", entries: [], isRepeat: false };
      }
      
      if (name && !map[key].name) map[key].name = name;
      if (phone && !map[key].phone) map[key].phone = phone;
      if (email && !map[key].email) map[key].email = email;
      
      map[key].entries.push(entry);
    };

    // Прогоняем заказы на изготовление
    (Array.isArray(orders) ? orders : []).forEach(o => {
      if (!o) return;
      upsert(o.clientPhone, o.clientName, {
        type: "order", id: o.id, date: o.orderDate, label: o.serviceType || o.orderTitle || "Заказ",
        total: calcOrder(o)?.clientTotal || 0, status: o.status, source: o.source || "Изготовление", location: o.location || "Vaugold"
      }, o.clientEmail);
    });

    // Прогоняем ремонты
    (Array.isArray(repairs) ? repairs : []).forEach(r => {
      if (!r) return;
      const label = Array.isArray(r.items) ? r.items.map(it => it?.type).filter(Boolean).slice(0, 2).join(", ") : "Ремонт";
      upsert(r.clientPhone, r.clientName, {
        type: "repair", id: r.id, date: r.orderDate,
        label: label || "Ремонт",
        total: r.totalWithVat || r.totalPrice || 0, status: r.receptionStatus || "Принято", source: r.source || "Ремонт", location: r.location || "Vaugold"
      }, r.clientEmail);
    });

    // Прогоняем CNC задачи
    (Array.isArray(cncOrders) ? cncOrders : []).forEach(o => {
      if (!o) return;
      upsert(o.clientId, o.clientId, {
        type: "cnc", id: o.id, date: o.orderDate, label: o.item || "CNC",
        total: calcCNC(o)?.clientTotal || 0, status: o.status, source: "CNC", location: o.location || "Vaugold"
      });
    });

    // Помечаем повторных клиентов (если больше 1 обращения) и считаем LTV
    Object.values(map).forEach(c => {
      c.isRepeat = Array.isArray(c.entries) && c.entries.length > 1;
      c.totalSpent = Array.isArray(c.entries) ? c.entries.reduce((s, e) => s + (e?.total || 0), 0) : 0;
    });

    return Object.values(map).sort((a, b) => (b.entries?.length || 0) - (a.entries?.length || 0));
  }, [orders, repairs, cncOrders]);

  // --- ЛОГИКА ФИЛЬТРАЦИИ ДЛЯ СТАТИСТИКИ ---
  const inPeriod = (date) => {
    if (!date) return periodType === "all";
    if (periodType === "all") return true;
    if (periodType === "year") return date.startsWith(selYear);
    if (periodType === "month") return date.startsWith(selMonth);
    if (periodType === "custom") {
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    }
    return true;
  };

  // Защита от undefined массива
  const safeAllContacts = Array.isArray(allContacts) ? allContacts : [];

  const activeInPeriod = useMemo(() => 
    safeAllContacts.filter(c => Array.isArray(c?.entries) && c.entries.some(e => inPeriod(e?.date))), 
  [safeAllContacts, periodType, selYear, selMonth, dateFrom, dateTo]);

  const statsBySource = useMemo(() => {
    const map = {};
    activeInPeriod.forEach(c => {
      if (!Array.isArray(c?.entries)) return;
      c.entries.filter(e => inPeriod(e?.date)).forEach(e => {
        const s = e?.source || "Другое";
        if (!map[s]) map[s] = { new: 0, repeat: 0 };
        if (c.isRepeat) map[s].repeat++; else map[s].new++;
      });
    });
    return map;
  }, [activeInPeriod]);

  const filtered = useMemo(() => {
    let list = subTab === "all" ? safeAllContacts
      : subTab === "orders" ? safeAllContacts.filter(c => Array.isArray(c?.entries) && c.entries.some(e => e?.type === "order"))
      : subTab === "repairs" ? safeAllContacts.filter(c => Array.isArray(c?.entries) && c.entries.some(e => e?.type === "repair"))
      : safeAllContacts.filter(c => Array.isArray(c?.entries) && c.entries.some(e => e?.type === "cnc"));
    
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => ((c?.name || "") + (c?.phone || "")).toLowerCase().includes(q));
    }
    return list;
  }, [safeAllContacts, subTab, search]);

  const totalRepeat = safeAllContacts.filter(c => c?.isRepeat).length;
  const repeatPct = safeAllContacts.length ? Math.round((totalRepeat / safeAllContacts.length) * 100) : 0;

  const years = useMemo(() => {
    const ys = new Set();
    safeAllContacts.forEach(c => {
      if (Array.isArray(c?.entries)) c.entries.forEach(e => { if (e?.date) ys.add(e.date.slice(0, 4)); });
    });
    for (let i = 0; i < 3; i++) ys.add(String(new Date().getFullYear() - i));
    return Array.from(ys).sort().reverse();
  }, [safeAllContacts]);

  const months = useMemo(() => {
    const ms = new Set();
    for (let i = 0; i < 24; i++) {
      const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
      ms.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(ms).sort().reverse();
  }, []);

  // --- ЭКСПОРТ В EXCEL ---
  const exportContacts = () => {
    const doExport = () => {
      const rows = filtered.map(c => {
        const entries = Array.isArray(c?.entries) ? c.entries : [];
        return {
          "Имя": c?.name || "",
          "Телефон": c?.phone || "",
          "Всего обращений": entries.length,
          "Заказов": entries.filter(e => e?.type === "order").length,
          "Ремонтов": entries.filter(e => e?.type === "repair").length,
          "CNC": entries.filter(e => e?.type === "cnc").length,
          "Повторный": c?.isRepeat ? "Да" : "Нет",
          "Общая сумма (€)": (c?.totalSpent || 0).toFixed(2),
          "Последнее обращение": entries.sort((a, b) => (b?.date || "") > (a?.date || "") ? 1 : -1)[0]?.date || "",
        };
      });
      const ws = window.XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Контакты");
      window.XLSX.writeFile(wb, `vaugold_contacts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (window.XLSX) { doExport(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = doExport;
    document.head.appendChild(s);
  };

  // --- ИМПОРТ ИЗ CSV ---
  const importContacts = (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || name.endsWith(".txt")) {
      const r = new FileReader(); 
      r.onload = ev => {
        const lines = ev.target.result.split(/\r?\n/).filter(Boolean);
        const sep = lines[0].includes(";") ? ";" : ",";
        const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));
        const nameIdx = header.findIndex(h => h.includes("name") || h.includes("имя") || h.includes("nimi") || h.includes("first"));
        const phoneIdx = header.findIndex(h => h.includes("phone") || h.includes("тел") || h.includes("number") || h.includes("mobil"));
        
        if (nameIdx < 0 && phoneIdx < 0) { 
          alert("Не удалось определить колонки. Нужны колонки с именем и/или телефоном."); 
          return; 
        }
        
        const imported = lines.slice(1).map(line => {
          const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
          return { name: nameIdx >= 0 ? cols[nameIdx] || "" : "", phone: phoneIdx >= 0 ? cols[phoneIdx] || "" : "" };
        }).filter(c => c.name || c.phone);
        
        alert(`Импортировано ${imported.length} контактов. Они появятся в базе при следующем обращении с их телефона.`);
      }; 
      r.readAsText(file);
    } else {
      alert("Поддерживаются форматы: CSV, TXT. Для XLSX — сначала сохрани как CSV.");
    }
  };

  // --- СОХРАНЕНИЕ ОТРЕДАКТИРОВАННОГО КОНТАКТА ---
  const handleEditSave = () => {
    if (!editingContact) return; // ЗАЩИТА ОТ КРАША
    const { key, name, phone } = editingContact;
    
    if (setOrders) {
      setOrders((Array.isArray(orders) ? orders : []).map(o => {
        if (!o) return o;
        const oKey = normPhone(o.clientPhone) || o.clientName;
        if (oKey === key) return { ...o, clientName: name, clientPhone: phone };
        return o;
      }));
    }
    setEditingContact(null);
  };

  const srcTag = src => src === "Ремонт" ? "🔧" : src === "CNC" ? "⚙" : "💎";

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* СТАТИСТИКА КЛИЕНТСКОЙ БАЗЫ */}
      <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
        <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-4 border-b border-slate-50 pb-2">Статистика клиентов</h3>
        
        {/* Фильтры периода */}
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {["all", "year", "month", "custom"].map(p => (
              <button key={p} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${periodType === p ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setPeriodType(p)}>
                {p === "all" ? "Всё время" : p === "year" ? "Год" : p === "month" ? "Месяц" : "Период"}
              </button>
            ))}
          </div>
          {periodType === "year" && <select className="border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold outline-none bg-white cursor-pointer" value={selYear} onChange={e => setSelYear(e.target.value)}>{years.map(y => <option key={y}>{y}</option>)}</select>}
          {periodType === "month" && <select className="border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold outline-none bg-white cursor-pointer" value={selMonth} onChange={e => setSelMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}</select>}
          {periodType === "custom" && (
            <div className="flex items-center gap-2">
              <DateInput value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="!py-1.5 !w-28" placeholder="От" />
              <span className="text-slate-400">—</span>
              <DateInput value={dateTo} onChange={e => setDateTo(e.target.value)} className="!py-1.5 !w-28" placeholder="До" />
            </div>
          )}
        </div>

        {/* Карточки метрик */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Всего в базе</span>
            <span className="text-2xl font-black text-slate-800">{safeAllContacts.length}</span>
            <span className="block text-[10px] text-slate-500 mt-1">уникальных профилей</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Постоянники</span>
            <span className="text-2xl font-black text-indigo-600">{totalRepeat}</span>
            <span className="block text-[10px] text-slate-500 mt-1">{repeatPct}% от всех</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Активные в периоде</span>
            <span className="text-2xl font-black text-blue-600">{activeInPeriod.length}</span>
            <span className="block text-[10px] text-slate-500 mt-1">совершали действия</span>
          </div>
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Новые за период</span>
            <span className="text-2xl font-black text-emerald-700">{activeInPeriod.filter(c => !c.isRepeat || (Array.isArray(c?.entries) && c.entries.filter(e => inPeriod(e?.date)).length === c.entries.length)).length}</span>
            <span className="block text-[10px] text-emerald-600/70 mt-1">первое обращение</span>
          </div>
        </div>

        {/* Таблица источников (Новые vs Повторные) */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
              <tr><th className="p-3 pl-4">Категория / Источник</th><th className="p-3 text-right">Новых</th><th className="p-3 text-right">Повторных</th><th className="p-3 text-right pr-4">Всего обращений</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(statsBySource).sort((a,b)=> (b[1].new+b[1].repeat) - (a[1].new+a[1].repeat)).map(([src, v]) => (
                <tr key={src} className="hover:bg-slate-50">
                  <td className="p-3 pl-4 font-semibold text-slate-700">{srcTag(src)} {src}</td>
                  <td className="p-3 text-right font-bold text-emerald-600">{v.new}</td>
                  <td className="p-3 text-right font-bold text-indigo-600">{v.repeat}</td>
                  <td className="p-3 text-right pr-4 font-black text-slate-800">{v.new + v.repeat}</td>
                </tr>
              ))}
              {Object.keys(statsBySource).length === 0 && <tr><td colSpan="4" className="p-4 text-center text-slate-400 text-xs italic">Нет данных за период</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* СПИСОК КЛИЕНТОВ */}
      <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
        
        {/* Панель фильтров списка */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[["all", "Все"], ["orders", "💎 Заказы"], ["repairs", "🔧 Ремонты"], ["cnc", "⚙ CNC"]].map(([id, lbl]) => (
              <button key={id} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${subTab === id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`} onClick={() => setSubTab(id)}>
                {lbl}
              </button>
            ))}
          </div>
          
          <div className="flex w-full md:w-auto gap-2">
            <input 
              type="text" 
              placeholder="🔍 Поиск по базе..." 
              className="flex-1 md:w-64 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              value={search} onChange={e => setSearch(e.target.value)} 
            />
            <button onClick={exportContacts} className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs px-3 rounded-xl hover:bg-emerald-100 transition-colors" title="Скачать Excel">⬇ XLS</button>
            <label className="bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs px-3 rounded-xl hover:bg-blue-100 transition-colors flex items-center cursor-pointer" title="Импорт CSV">
              ⬆ CSV
              <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={e => { importContacts(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        {/* Карточки списка */}
        <div className="grid grid-cols-1 gap-4">
          {filtered.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl p-12 text-center text-slate-400 italic border border-slate-100">По заданным критериям совпадений не обнаружено</div>
          ) : filtered.map(c => (
            <div key={c.key} className={`bg-white rounded-[20px] shadow-sm border border-slate-100 overflow-hidden transition-all hover:shadow-md ${expanded === c.key ? 'ring-1 ring-slate-200' : ''}`}>
              
              {/* Шапка карточки */}
              <div className="p-4 md:p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between" onClick={() => setExpanded(expanded === c.key ? null : c.key)}>
                
                <div className="flex-1 min-w-0">
                  {editingContact?.key === c.key ? (
                    // Режим редактирования
                    <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                      <input className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={editingContact.name} onChange={e => setEditingContact(p => ({...p, name: e.target.value}))} placeholder="Имя" />
                      <input className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={editingContact.phone} onChange={e => setEditingContact(p => ({...p, phone: e.target.value}))} placeholder="Телефон" />
                      <button onClick={handleEditSave} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">Сохранить</button>
                      <button onClick={() => setEditingContact(null)} className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200">Отмена</button>
                    </div>
                  ) : (
                    // Режим просмотра
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        {c.isRepeat && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Постоянный клиент"></span>}
                        <h3 className="text-base font-bold text-slate-800 tracking-tight truncate">{c.name || "—"}</h3>
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full">{Array.isArray(c.entries) ? c.entries.length : 0}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-slate-500 font-medium flex-wrap mt-2">
                        <span>{c.phone || "—"}</span>
                        {c.email && <><span className="text-slate-300">|</span><span>{c.email}</span></>}
                        
                        {(() => {
                          if (!Array.isArray(c.entries)) return null;
                          const last = [...c.entries].sort((a, b) => (b?.date || "") > (a?.date || "") ? 1 : -1)[0];
                          if (!last) return null;
                          return (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="flex items-center gap-1"><span className="text-[10px]">{srcTag(last.source)}</span> {last.source}</span>
                              <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">{last.location}</span>
                            </>
                          );
                        })()}
                        
                        {c.isRepeat && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded ml-auto md:ml-0 uppercase tracking-wider">↩ Повторный</span>}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-4 text-right w-full md:w-auto mt-2 md:mt-0">
                  <div className="flex-1 md:flex-none">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">LTV (Оборот)</span>
                    <span className="text-lg font-black text-emerald-600">{fmt(c.totalSpent || 0)}</span>
                  </div>
                  {!editingContact && (
                    <button className="text-slate-300 hover:text-blue-500 p-2 rounded-full hover:bg-blue-50 transition-colors" onClick={e => { e.stopPropagation(); setEditingContact({ key: c.key, name: c.name, phone: c.phone }); }} title="Редактировать ФИО/Номер">
                      ✏️
                    </button>
                  )}
                </div>
              </div>

              {/* Раскрытая история */}
              {expanded === c.key && Array.isArray(c.entries) && (
                <div className="p-4 md:p-6 border-t border-slate-100 bg-slate-50/50 animate-fade-in">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Хронология обращений</h4>
                  <div className="space-y-2">
                    {c.entries.sort((a, b) => (b?.date || "") > (a?.date || "") ? 1 : -1).map((e, j) => (
                      <div key={j} className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-xs">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-500 font-semibold" title={e?.source}>
                            <span>{srcTag(e?.source)}</span> <span className="hidden sm:inline">{e?.source}</span>
                          </span>
                          <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{e?.location}</span>
                          <span className="font-bold text-slate-800">{e?.label}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            e?.status === "Выдано" || e?.status === "Выдано клиенту" ? "bg-slate-100 text-slate-500" :
                            e?.status === "В работе" || e?.status === "Передано мастеру" ? "bg-emerald-100 text-emerald-700" :
                            e?.status === "Завершено" || e?.status === "Ремонт готов" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                          }`}>{e?.status}</span>
                        </div>
                        <div className="flex items-center gap-4 sm:justify-end">
                          <span className="text-slate-400">{fmtDate(e?.date)}</span>
                          <span className="font-black text-slate-800 w-16 text-right">{fmt(e?.total || 0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Итого потрачено</span>
                    <span className="text-lg font-black text-emerald-600">{fmt(c.totalSpent || 0)}</span>
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContactsTab;