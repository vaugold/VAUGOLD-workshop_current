// src/features/RepairStatsTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, fmtDate, todayStr, mKey, mLabel } from '../utils/helpers';
import { MASTERS } from '../utils/constants';

/**
 * Внутренний компонент для отрисовки простых столбчатых диаграмм на Tailwind.
 * Позволяет визуализировать статистику без тяжелых библиотек вроде Chart.js.
 */
const BarChart = ({ data, colorClass = "bg-blue-500" }) => {
  // Находим максимальное значение для расчета процентов ширины столбца
  const max = Math.max(...data.map(d => d[1]), 1);
  return (
    <div className="space-y-3">
      {data.map(([label, value]) => {
        const pct = Math.max(5, (value / max) * 100); // Минимум 5%, чтобы столбец не пропадал
        return (
          <div key={label} className="flex items-center text-xs">
            <div className="w-1/3 truncate pr-3 text-slate-500 text-right font-medium" title={label}>{label}</div>
            <div className="w-2/3 h-6 bg-slate-50 rounded-lg overflow-hidden flex items-center">
              <div 
                className={`h-full flex items-center px-2 text-[10px] font-bold text-white transition-all duration-500 ${colorClass}`} 
                style={{ width: `${pct}%` }}
              >
                {value > 0 ? value : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Модуль аналитики и KPI по ремонтам ювелирных изделий.
 * Восстановлена полная статистика: мастера, типы изделий, металл, точки, тренды за 6 месяцев.
 */
export const RepairStatsTab = ({ repairs = [] }) => {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  // Стейты фильтров и навигации
  const [month, setMonth] = useState(curMonth);
  const [stab, setStab] = useState("summary"); // Активная подвкладка
  const [rPeriodMode, setRPeriodMode] = useState("month");
  const [rYear, setRYear] = useState(String(now.getFullYear()));
  const [openBlock, setOpenBlock] = useState(null); // Для раскрытия списков
  const [statModal, setStatModal] = useState(null); // Модалка с детализацией

  // Фильтруем черновики (считаем только реальные заказы)
  const all = useMemo(() => (repairs || []).filter(r => !r.isDraft), [repairs]);

  // Генерируем опции для селектов дат
  const yearOptions = useMemo(() => {
    const ys = new Set();
    all.forEach(r => { if (r.orderDate) ys.add(r.orderDate.slice(0, 4)); });
    for (let i = 0; i < 5; i++) ys.add(String(now.getFullYear() - i));
    return Array.from(ys).filter(Boolean).sort().reverse();
  }, [all, now]);

  const monthOptions = useMemo(() => {
    const ms = new Set();
    all.forEach(r => { if (r.orderDate) ms.add(mKey(r.orderDate)); });
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      ms.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(ms).filter(Boolean).sort().reverse();
  }, [all, now]);

  // Проверка: входит ли дата в выбранный период
  const inPeriodR = date => {
    if (!date) return false;
    if (rPeriodMode === "year") return date.slice(0, 4) === rYear;
    return mKey(date) === month;
  };
  const periodLabel = rPeriodMode === "year" ? rYear : mLabel(month);

  // --- БАЗОВЫЕ ВЫБОРКИ ---
  const intake = all.filter(r => inPeriodR(r.orderDate));
  const delivered = all.filter(r => r.receptionStatus === "Выдано клиенту" && inPeriodR(r.deliveryDate || r.orderDate));
  const inWork = all.filter(r => r.receptionStatus === "Передано мастеру" || r.masterStatus === "В работе");
  const ready = all.filter(r => r.masterStatus === "Ремонт готов" && r.receptionStatus !== "Выдано клиенту");

  // Функция расчета "чистой" стоимости работы (без учета проданного металла и камней)
  const repairWorkPrice = r => {
    const itemsWork = (r.items || []).reduce((s, it) => s + (parseFloat(it.price) || 0), 0);
    const otherExtras = (r.extras || []).filter(e => e.type !== "Металл" && e.type !== "Камни").reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
    return itemsWork + otherExtras;
  };

  const totalDelivRev = delivered.reduce((s, r) => s + repairWorkPrice(r), 0);
  const avgCheck = delivered.length ? totalDelivRev / delivered.length : 0;
  
  const avgDays = (() => {
    const ds = delivered.filter(r => r.deliveryDate && r.orderDate)
      .map(r => Math.max(0, Math.ceil((new Date(r.deliveryDate + "T00:00:00") - new Date(r.orderDate + "T00:00:00")) / 86400000)));
    return ds.length ? Math.round(ds.reduce((s, d) => s + d, 0) / ds.length) : null;
  })();

  const allTimeRev = all.filter(r => r.receptionStatus === "Выдано клиенту").reduce((s, r) => s + (r.totalWithVat || r.totalPrice || 0), 0);
  const newCount = all.filter(r => r.isRepeat !== "Повторный").length;
  const repCount = all.filter(r => r.isRepeat === "Повторный").length;

  // --- АНАЛИТИЧЕСКИЕ АГРЕГАЦИИ ---
  
  // 1. По типам услуг
  const byType = useMemo(() => {
    const m = {};
    intake.forEach(r => (r.items || []).forEach(it => {
      const t = it.type || "Прочее";
      if (!m[t]) m[t] = { count: 0, total: 0, prices: [] };
      m[t].count++;
      const p = parseFloat(it.price) || 0;
      m[t].total += p; 
      if (p > 0) m[t].prices.push(p);
    }));
    return Object.entries(m).sort((a, b) => b[1].count - a[1].count);
  }, [intake]);

  // 2. Средний чек по типу (за все время)
  const avgByType = useMemo(() => {
    const m = {};
    all.forEach(r => (r.items || []).forEach(it => {
      const t = it.type || "Прочее"; const p = parseFloat(it.price) || 0;
      if (!m[t]) m[t] = { sum: 0, cnt: 0 };
      if (p > 0) { m[t].sum += p; m[t].cnt++; }
    }));
    return Object.entries(m).filter(([, v]) => v.cnt > 0)
      .map(([t, v]) => ([t, v.sum / v.cnt, v.cnt]))
      .sort((a, b) => b[1] - a[1]);
  }, [all]);

  // 3. По точкам приема
  const byLocation = useMemo(() => {
    const m = {};
    intake.forEach(r => {
      const l = r.location || "Vaugold";
      if (!m[l]) m[l] = { count: 0, total: 0, delivered: 0 };
      m[l].count++;
      m[l].total += (r.totalWithVat || r.totalPrice || 0);
    });
    delivered.forEach(r => {
      const l = r.location || "Vaugold";
      if (!m[l]) m[l] = { count: 0, total: 0, delivered: 0 };
      m[l].delivered++;
    });
    return Object.entries(m).sort((a, b) => b[1].count - a[1].count);
  }, [intake, delivered]);

  // 4. По мастерам
  // Хелпер: достать мастеров из позиции (новая структура masters[] с миграцией со старой)
  const getItemMasters = (it) => {
    if (Array.isArray(it.masters) && it.masters.length > 0) return it.masters;
    if (it.masterName || it.price) return [{ name: it.masterName || "", cost: it.price || "", outsourceCost: "" }];
    return [];
  };

  const byMaster = useMemo(() => {
    const m = {};
    intake.forEach(r => {
      (r.items || []).forEach(it => {
        const itemMasters = getItemMasters(it);
        // Считаем статистику по разбивке мастеров
        if (itemMasters.length > 0) {
          itemMasters.forEach(mstr => {
            const name = (mstr.name || "").trim();
            if (!name || name === MASTERS.OUTSOURCE) return; // аутсорс не идёт в доход мастеров
            if (!m[name]) m[name] = { count: 0, total: 0, delivered: 0 };
            m[name].count++;
            m[name].total += parseFloat(mstr.cost) || 0;
          });
        } else {
          // Fallback на старую структуру (если masters отсутствует и нет masterName/price)
          const master = (it.masterName || "").trim();
          if (!master || master === MASTERS.OUTSOURCE) return;
          if (!m[master]) m[master] = { count: 0, total: 0, delivered: 0 };
          m[master].count++;
          m[master].total += parseFloat(it.price) || 0;
        }
        // Учитываем покрытие (не зависит от разбивки, это из extras)
        (it.extras || []).forEach(ex => {
          const cm = ex.coatingMaster;
          if (!cm || cm === MASTERS.OUTSOURCE) return;
          const cmInc = parseFloat(ex.coatingMasterCost) || 0;
          if (cmInc > 0) {
            if (!m[cm]) m[cm] = { count: 0, total: 0, delivered: 0 };
            m[cm].total += cmInc;
          }
        });
      });
    });
    delivered.forEach(r => {
      const mastersAll = new Set();
      (r.items || []).forEach(it => {
        getItemMasters(it).forEach(mstr => { if (mstr.name) mastersAll.add(mstr.name); });
        if (it.masterName) mastersAll.add(it.masterName);
      });
      mastersAll.forEach(master => {
        if (!master || master === MASTERS.OUTSOURCE) return;
        if (!m[master]) m[master] = { count: 0, total: 0, delivered: 0 };
        m[master].delivered++;
      });
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  }, [intake, delivered]);

  // 5. Динамика за 6 месяцев (Тренд)
  const trend = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mIntake = all.filter(r => mKey(r.orderDate) === mk);
      const mDel = all.filter(r => r.receptionStatus === "Выдано клиенту" && mKey(r.deliveryDate || r.orderDate) === mk);
      months.push({
        mk, label: mLabel(mk).split(" ")[0],
        intake: mIntake.length, delivered: mDel.length,
        revenue: mDel.reduce((s, r) => s + (r.totalWithVat || r.totalPrice || 0), 0)
      });
    }
    return months;
  }, [all, now]);
  
  const maxRev = Math.max(...trend.map(t => t.revenue), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* ПАНЕЛЬ ФИЛЬТРОВ */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-[22px] border border-slate-100 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Аналитика направления «Ремонт»</h2>
          <p className="text-xs text-slate-400 mt-0.5">KPI мастеров, загрузка, средний чек и конверсия</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rPeriodMode === "month" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setRPeriodMode("month")}>Месяц</button>
            <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rPeriodMode === "year" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setRPeriodMode("year")}>Год</button>
          </div>
          {rPeriodMode === "month" ? (
            <select className="border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer text-slate-700" value={month} onChange={e => setMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
            </select>
          ) : (
            <select className="border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer text-slate-700" value={rYear} onChange={e => setRYear(e.target.value)}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* ПОДВКЛАДКИ (НАВИГАЦИЯ) */}
      <div className="flex flex-wrap gap-2">
        {[
          ["summary", "Резюме"], ["types", "По услугам"], ["avg", "Ср. чек"], 
          ["locations", "Точки"], ["masters", "Мастера"], ["trend", "Динамика"]
        ].map(([id, lbl]) => (
          <button 
            key={id} 
            onClick={() => setStab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${stab === id ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* КОНТЕНТ ВКЛАДОК */}
      <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
        
        {/* === РЕЗЮМЕ === */}
        {stab === "summary" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Ключевые метрики за {periodLabel}</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Принято</span>
                <span className="text-2xl font-black text-slate-800 block mt-1">{intake.length}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Выдано</span>
                <span className="text-2xl font-black text-emerald-600 block mt-1">{delivered.length}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">В работе</span>
                <span className="text-2xl font-black text-blue-600 block mt-1">{inWork.length}</span>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ожидают выдачи</span>
                <span className="text-2xl font-black text-amber-500 block mt-1">{ready.length}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-xl text-emerald-900">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Доход с выданных</span>
                <span className="text-2xl font-serif font-black block mt-1">{fmt(totalDelivRev)}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ср. чек (только работы)</span>
                <span className="text-2xl font-black block mt-1">{delivered.length ? fmt(avgCheck) : "—"}</span>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl text-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ср. срок ремонта</span>
                <span className="text-2xl font-black block mt-1">{avgDays !== null ? `${avgDays} дн.` : "—"}</span>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-4">Глобально (Все время)</h3>
              <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
                <div className="flex flex-col"><span className="text-slate-400">Всего принято:</span><span className="font-bold">{all.length}</span></div>
                <div className="flex flex-col"><span className="text-slate-400">Выдано:</span><span className="font-bold text-emerald-600">{all.filter(r=>r.receptionStatus==="Выдано клиенту").length}</span></div>
                <div className="flex flex-col"><span className="text-slate-400">Выручка (выданные):</span><span className="font-bold text-blue-600">{fmt(allTimeRev)}</span></div>
                <div className="flex flex-col"><span className="text-slate-400">Новые клиенты:</span><span className="font-bold">{newCount}</span></div>
                <div className="flex flex-col"><span className="text-slate-400">Повторные:</span><span className="font-bold text-indigo-600">{repCount} ({all.length ? Math.round(repCount/all.length*100) : 0}%)</span></div>
              </div>
            </div>
          </div>
        )}

        {/* === ПО УСЛУГАМ === */}
        {stab === "types" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Количество и сумма по услугам ({periodLabel})</h3>
            {byType.length === 0 ? <p className="text-sm text-slate-400 italic">Нет данных</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <BarChart data={byType.map(([t, v]) => [t, v.count])} colorClass="bg-indigo-400" />
                <div className="overflow-hidden border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                      <tr><th className="p-3">Услуга</th><th className="p-3">Кол-во</th><th className="p-3 text-right">Сумма</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byType.map(([t, v]) => (
                        <tr key={t} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-700">{t}</td>
                          <td className="p-3 text-slate-500">{v.count}</td>
                          <td className="p-3 text-right font-bold text-slate-800">{v.total > 0 ? fmt(v.total) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === СРЕДНИЙ ЧЕК === */}
        {stab === "avg" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Средний чек по типу ремонта (За всё время)</h3>
            {avgByType.length === 0 ? <p className="text-sm text-slate-400 italic">Нет данных</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <BarChart data={avgByType.map(([t, avg]) => [t, Math.round(avg)])} colorClass="bg-emerald-400" />
                <div className="overflow-hidden border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                      <tr><th className="p-3">Услуга</th><th className="p-3 text-right">Ср. чек</th><th className="p-3 text-right">Записей</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {avgByType.map(([t, avg, cnt]) => (
                        <tr key={t} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-700">{t}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">{fmt(avg)}</td>
                          <td className="p-3 text-right text-slate-400">{cnt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === ПО ТОЧКАМ === */}
        {stab === "locations" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Конверсия по точкам приема ({periodLabel})</h3>
            {byLocation.length === 0 ? <p className="text-sm text-slate-400 italic">Нет данных</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <BarChart data={byLocation.map(([l, v]) => [l, v.count])} colorClass="bg-blue-400" />
                <div className="overflow-hidden border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                      <tr><th className="p-3">Точка</th><th className="p-3">Принято</th><th className="p-3">Выдано</th><th className="p-3 text-right">Сумма (Брутто)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byLocation.map(([l, v]) => (
                        <tr key={l} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-slate-700">{l}</td>
                          <td className="p-3 text-slate-500">{v.count}</td>
                          <td className="p-3 text-emerald-600 font-medium">{v.delivered}</td>
                          <td className="p-3 text-right font-bold text-slate-800">{fmt(v.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === МАСТЕРА === */}
        {stab === "masters" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Загрузка и выручка по мастерам ({periodLabel})</h3>
            {byMaster.length === 0 ? <p className="text-sm text-slate-400 italic">Нет данных</p> : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <BarChart data={byMaster.map(([m, v]) => [m, v.count])} colorClass="bg-indigo-400" />
                <div className="overflow-hidden border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                      <tr><th className="p-3">Мастер</th><th className="p-3">Взял в работу</th><th className="p-3">Сдал (Выдано)</th><th className="p-3 text-right">Сумма работ</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byMaster.map(([m, v]) => (
                        <tr key={m} className="hover:bg-slate-50 cursor-pointer" onClick={() => setStatModal({
                          title: `🔧 Работы мастера: ${m}`,
                          items: intake.flatMap(r => {
                            const matched = [];
                            (r.items || []).forEach(it => {
                              const itemMasters = getItemMasters(it);
                              itemMasters.forEach(mstr => {
                                if ((mstr.name || "").trim() === m) {
                                  matched.push({ label: r.clientName || "Без имени", sub: it.type, amount: mstr.cost });
                                }
                              });
                              // Fallback: старая структура
                              if (itemMasters.length === 0 && it.masterName === m) {
                                matched.push({ label: r.clientName || "Без имени", sub: it.type, amount: it.price });
                              }
                            });
                            return matched;
                          })
                        })}>
                          <td className="p-3 font-semibold text-slate-700">{m}</td>
                          <td className="p-3 text-slate-500">{v.count}</td>
                          <td className="p-3 text-emerald-600 font-medium">{v.delivered}</td>
                          <td className="p-3 text-right font-bold text-blue-600">{fmt(v.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="bg-slate-50 p-3 text-xs text-slate-500 italic">
                    * Кликните на строку мастера, чтобы увидеть расшифровку работ.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === ДИНАМИКА === */}
        {stab === "trend" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-6">Динамика выручки за последние 6 месяцев</h3>
            
            {/* Визуальный график */}
            <div className="flex items-end gap-4 h-48 mb-8 border-b border-slate-200 pb-2">
              {trend.slice().reverse().map(t => (
                <div key={t.mk} className="flex-1 flex flex-col items-center gap-2 relative group">
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-slate-800 text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity whitespace-nowrap">
                    {fmt(t.revenue)}
                  </div>
                  <div 
                    className={`w-full rounded-t-md transition-all duration-700 ${t.mk === month ? 'bg-blue-500' : 'bg-slate-200 hover:bg-slate-300'}`}
                    style={{ height: `${Math.max(5, (t.revenue / maxRev) * 100)}%` }}
                  />
                  <div className={`text-[10px] font-bold ${t.mk === month ? 'text-blue-600' : 'text-slate-400'}`}>{t.label}</div>
                </div>
              ))}
            </div>

            {/* Таблица */}
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                  <tr><th className="p-3">Месяц</th><th className="p-3">Принято шт.</th><th className="p-3">Выдано шт.</th><th className="p-3 text-right">Выручка</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trend.map(t => (
                    <tr key={t.mk} className={t.mk === month ? "bg-blue-50/30" : "hover:bg-slate-50"}>
                      <td className={`p-3 font-semibold ${t.mk === month ? "text-blue-700" : "text-slate-700"}`}>{mLabel(t.mk)}</td>
                      <td className="p-3 text-slate-500">{t.intake}</td>
                      <td className="p-3 text-emerald-600 font-medium">{t.delivered}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{t.revenue > 0 ? fmt(t.revenue) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* МОДАЛКА ДЕТАЛИЗАЦИИ */}
      {statModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[999] flex items-center justify-center p-4" onClick={() => setStatModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-lg">{statModal.title}</h3>
              <button onClick={() => setStatModal(null)} className="text-slate-400 hover:text-rose-500 font-bold text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {(!statModal.items || statModal.items.length === 0) ? (
                <p className="text-sm text-slate-400 italic text-center py-4">Детализация отсутствует</p>
              ) : statModal.items.map((x, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-700 text-sm">{x.label}</span>
                    {x.sub && <span className="text-xs text-slate-500 mt-0.5">{x.sub}</span>}
                  </div>
                  {x.amount !== undefined && <span className="font-bold text-blue-600">{fmt(x.amount)}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RepairStatsTab;