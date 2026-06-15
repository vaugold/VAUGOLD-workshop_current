// src/features/StatsTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, fmtDate, mKey, mLabel, isDone, oStatus } from '../utils/helpers';
import { calcOrder, calcCNC, L24_COMMISSION } from '../utils/calculations';
import { DEFAULT_WORKERS, MASTERS } from '../utils/constants';

const LOCATIONS = ["Vaugold", "Sikupilli", "L24"];

// --- БРОНЕЖИЛЕТ ДЛЯ СТАРЫХ ДАННЫХ ---
// Эти хелперы спасают от краша, если в старой базе вместо массива лежит null, undefined или строка
const safeFilter = (arr, fn) => Array.isArray(arr) ? arr.filter(fn) : [];
const safeReduce = (arr, fn, init) => Array.isArray(arr) ? arr.reduce(fn, init) : init;

const safeCalcOrder = (o) => { try { return calcOrder(o || {}) || {}; } catch(e) { return {}; } };
const safeCalcCNC = (o) => { try { return calcCNC(o || {}) || {}; } catch(e) { return {}; } };

// Простой Tailwind-график для визуализации
const BarChart = ({ data, colorClass = "bg-blue-500" }) => {
  const max = Math.max(...data.map(d => d[1]), 1);
  return (
    <div className="space-y-3">
      {data.map(([label, value]) => {
        const pct = Math.max(5, (value / max) * 100);
        return (
          <div key={label} className="flex items-center text-xs">
            <div className="w-1/3 truncate pr-3 text-slate-500 text-right font-medium" title={label}>{label}</div>
            <div className="w-2/3 h-6 bg-slate-50 rounded-lg overflow-hidden flex items-center">
              <div className={`h-full flex items-center px-2 text-[10px] font-bold text-white transition-all ${colorClass}`} style={{ width: `${pct}%` }}>
                {value > 0 ? (typeof value === "number" && value % 1 !== 0 ? fmt(value) : value) : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const StatsTab = ({ orders = [], cncOrders = [], repairs = [], expenses = {}, providers = [] }) => {
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const [month, setMonth] = useState(curMonth);
  const [statPeriodMode, setStatPeriodMode] = useState("month"); 
  const [statYear, setStatYear] = useState(String(now.getFullYear()));
  const [stab, setStab] = useState("summary");
  const [statModal, setStatModal] = useState(null);

  // Защищаем массивы на входе
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeCnc = Array.isArray(cncOrders) ? cncOrders : [];
  const safeRepairs = Array.isArray(repairs) ? repairs : [];
  const safeProviders = Array.isArray(providers) ? providers : [];
  const safeExpenses = expenses || {};

  const yearOptions = useMemo(() => {
    const ys = new Set();
    [...safeOrders, ...safeCnc].forEach(o => { if(o?.orderDate) ys.add(o.orderDate.slice(0,4)); });
    for(let i=0; i<5; i++) ys.add(String(now.getFullYear()-i));
    return Array.from(ys).filter(Boolean).sort().reverse();
  }, [safeOrders, safeCnc, now]);

  const monthOptions = useMemo(() => {
    const ms = new Set();
    [...safeOrders, ...safeCnc].forEach(o => { if(o?.orderDate) ms.add(mKey(o.orderDate)); });
    for(let i=0; i<12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      ms.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
    }
    return Array.from(ms).filter(Boolean).sort().reverse();
  }, [safeOrders, safeCnc, now]);

  const inPeriod = date => {
    if (!date) return false;
    if (statPeriodMode === "year") return date.slice(0, 4) === statYear;
    return mKey(date) === month;
  };
  const periodLabel = statPeriodMode === "year" ? statYear : mLabel(month);

  // --- БАЗОВЫЕ ВЫБОРКИ (Безопасные) ---
  const intakeOrders = safeFilter(safeOrders, o => o && inPeriod(o.orderDate) && oStatus(o) !== "Запрос" && !o.isDraft);
  const completedOrders = safeFilter(safeOrders, o => o && isDone(oStatus(o)) && !o.isDraft && (
    inPeriod(o.workDoneDate || o.deliveryDate || o.orderDate) ||
    (o.location === "L24" && o.paymentStatus === "Оплачено" && inPeriod(o.paymentDate))
  ));
  const deliveredOrders = safeFilter(safeOrders, o => o && o.deliveryDate && inPeriod(o.deliveryDate) && !o.isDraft);
  
  const cncPaidMonth = safeFilter(safeCnc, o => o && o.paymentStatus === "Оплачено" && inPeriod(o.paymentDate));

  const completedIncome = safeReduce(completedOrders, (s, o) => s + (safeCalcOrder(o).projectIncome || 0), 0);
  const cncWsIncome = safeReduce(cncPaidMonth, (s, o) => s + (safeCalcCNC(o).workshopShare || 0), 0);
  
  const intakeRepairs = safeFilter(safeRepairs, r => r && inPeriod(r.orderDate) && !r.isDraft);
  const deliveredRepairs = safeFilter(safeRepairs, r => r && r.receptionStatus === "Выдано клиенту" && inPeriod(r.deliveryDate || r.orderDate) && !r.isDraft);
  
  const l24PrepaidOrders = safeFilter(safeOrders, o => o && o.location === "L24" && parseFloat(o.l24Prepayment) > 0 && inPeriod(o.l24PrepaymentDate));

  // Сверхбезопасный расчет доходов по ремонтам
  const repairIncome = safeReduce(deliveredRepairs, (s, r) => {
    if (!r) return s;
    if (r.netIncome !== undefined) return s + (r.netIncome || 0);
    const total = parseFloat(r.totalPrice) || 0;
    const itemsWorkCost = safeReduce(r.items, (s2, it) => {
      if (!it) return s2;
      return s2 + safeReduce(it.extras, (s3, e) => s3 + (parseFloat(e?.cost) || 0), 0);
    }, 0);
    const rExtrasCost = safeReduce(r.extras, (s2, e) => s2 + (parseFloat(e?.cost) || 0), 0);
    const commission = r.location === "L24" ? total * L24_COMMISSION : 0;
    return s + total - itemsWorkCost - rExtrasCost - commission;
  }, 0);

  const totalWsIncome = completedIncome + cncWsIncome + repairIncome;

  // --- ОПЛАТЫ ---
  const prepayByMethod = {};
  safeFilter(intakeOrders, o => o.location !== "L24").forEach(o => { const m = o.paymentMethod || "Наличные"; const a = parseFloat(o.prepayment) || 0; if (a > 0) prepayByMethod[m] = (prepayByMethod[m] || 0) + a; });
  l24PrepaidOrders.forEach(o => { const m = "Перевод"; const a = parseFloat(o.l24Prepayment) || 0; if (a > 0) prepayByMethod[m] = (prepayByMethod[m] || 0) + a; });
  intakeRepairs.forEach(r => { const m = r.paymentMethod || "Наличные"; const a = parseFloat(r.prepayment) || 0; if (a > 0) prepayByMethod[m] = (prepayByMethod[m] || 0) + a; });

  const finalByMethod = {};
  const finalPayOrders = [
    ...safeFilter(deliveredOrders, o => o.location !== "L24"),
    ...safeFilter(safeOrders, o => o && o.location === "L24" && o.paymentStatus === "Оплачено" && inPeriod(o.paymentDate) && !o.isDraft)
  ];
  finalPayOrders.forEach(o => { const oc = safeCalcOrder(o); const m = o.finalPaymentMethod || "Наличные"; const a = o.location === "L24" ? (oc.l24Remaining || 0) : (oc.balance || 0); if (a > 0) finalByMethod[m] = (finalByMethod[m] || 0) + a; });
  deliveredRepairs.forEach(r => { const m = r.finalPaymentMethod || "Наличные"; const a = (r.balanceWithVat || r.balance) || 0; if (a > 0) finalByMethod[m] = (finalByMethod[m] || 0) + a; });

  const prepayments = Object.values(prepayByMethod).reduce((s, v) => s + v, 0);
  const finalPayments = Object.values(finalByMethod).reduce((s, v) => s + v, 0);
  const cncPayments = safeReduce(cncPaidMonth, (s, o) => s + (safeCalcCNC(o).clientTotal || 0), 0);
  const totalPaymentsIn = prepayments + finalPayments + cncPayments;

  const payBreakdown = {};
  Object.entries(prepayByMethod).forEach(([m, v]) => { payBreakdown[m] = (payBreakdown[m] || 0) + v; });
  Object.entries(finalByMethod).forEach(([m, v]) => { payBreakdown[m] = (payBreakdown[m] || 0) + v; });

  // --- РАСХОДЫ И ПРИБЫЛЬ ---
  const expData = safeExpenses[month] || {};
  const subrent = parseFloat(expData["subrent"]) || 0;
  const fixedExp = safeReduce(safeFilter(safeProviders, p => p && p.key !== "subrent"), (s, p) => s + (parseFloat(expData[p.key]) || 0), 0);
  const extrasExp = safeReduce(expData.extras, (s, e) => s + (parseFloat(e?.amount) || 0), 0);
  const salariesExp = safeReduce(expData.salaries, (s, sl) => s + (parseFloat(sl?.amount) || 0), 0);
  const totalExp = fixedExp + extrasExp + salariesExp - subrent;
  const netProfit = totalWsIncome - totalExp;

  // --- ЛОКАЦИИ (ТОЧКИ) ---
  const byLocation = useMemo(() => {
    const map = {};
    LOCATIONS.forEach(l => { map[l] = { orders: 0, repairs: 0, workTotal: 0, income: 0, l24commission: 0 }; });
    map["Другое"] = { orders: 0, repairs: 0, workTotal: 0, income: 0, l24commission: 0 };

    intakeOrders.forEach(o => {
      const key = LOCATIONS.includes(o.location) ? o.location : "Другое";
      map[key].orders++;
      const c = safeCalcOrder(o);
      map[key].workTotal += c.isL24 ? c.l24OweUs : c.workTotal;
      map[key].income += c.projectIncome;
      map[key].l24commission += c.l24Commission || 0;
    });
    safeFilter(safeRepairs, r => r && inPeriod(r.orderDate)).forEach(r => {
      const key = LOCATIONS.includes(r.location) ? r.location : "Другое";
      map[key].repairs++;
      const total = parseFloat(r.totalPrice) || 0;
      map[key].workTotal += key === "L24" ? total * 0.8 : total;
      const commission = key === "L24" ? total * L24_COMMISSION : 0;
      map[key].income += total - commission;
      map[key].l24commission += commission;
    });
    return Object.entries(map).filter(([, v]) => v.orders + v.repairs > 0).sort((a, b) => (b[1].orders + b[1].repairs) - (a[1].orders + a[1].repairs));
  }, [intakeOrders, safeRepairs, month, statPeriodMode, statYear]);

  // --- ИСТОЧНИКИ ---
  const srcDetail = {};
  intakeOrders.forEach(o => {
    const src = o.source || "?";
    if (!srcDetail[src]) srcDetail[src] = { types: {}, workTotal: 0, income: 0, prepaid: 0, finalPaid: 0 };
    srcDetail[src].types[o.serviceType || "Иное"] = (srcDetail[src].types[o.serviceType || "Иное"] || 0) + 1;
    const c = safeCalcOrder(o);
    srcDetail[src].workTotal += c.isL24 ? (c.workTotal * 0.8 || 0) : (c.workTotal || 0);
    srcDetail[src].income += c.projectIncome || 0;
    srcDetail[src].prepaid += parseFloat(o.prepayment) || 0;
  });
  deliveredOrders.forEach(o => {
    const src = o.source || "?";
    if (!srcDetail[src]) srcDetail[src] = { types: {}, workTotal: 0, income: 0, prepaid: 0, finalPaid: 0 };
    srcDetail[src].finalPaid += safeCalcOrder(o).balance || 0;
  });

  // --- ИЗДЕЛИЯ ---
  const byType = {};
  completedOrders.forEach(o => {
    const t = o.serviceType || "Иное";
    if (!byType[t]) byType[t] = { count: 0, workTotal: 0, income: 0 };
    const c = safeCalcOrder(o);
    byType[t].count++; 
    byType[t].workTotal += c.isL24 ? (c.workTotal * 0.8 || 0) : (c.workTotal || 0); 
    byType[t].income += c.projectIncome || 0;
  });
  const typeRows = Object.entries(byType).sort((a, b) => b[1].count - a[1].count);

  // --- СРОКИ ---
  const typeTime = {};
  safeOrders.forEach(o => {
    if (o && o.deliveryDate && o.orderDate && isDone(oStatus(o))) {
      const t = o.serviceType || "Иное";
      const days = Math.max(0, Math.round((new Date(o.deliveryDate) - new Date(o.orderDate)) / 86400000));
      if (!isNaN(days)) {
        if (!typeTime[t]) typeTime[t] = { total: 0, count: 0 };
        typeTime[t].total += days;
        typeTime[t].count++;
      }
    }
  });
  const avgTimeRows = Object.entries(typeTime).map(([t, v]) => [t, Math.round(v.total / v.count)]).sort((a, b) => b[1] - a[1]);

  // --- CNC ---
  const byCncClient = {};
  safeCnc.forEach(o => {
    if (!o || !o.clientId) return;
    if (!byCncClient[o.clientId]) byCncClient[o.clientId] = { count: 0, income: 0, paid: 0 };
    byCncClient[o.clientId].count++;
    byCncClient[o.clientId].income += safeCalcCNC(o).netIncome || 0;
    if (o.paymentStatus === "Оплачено") byCncClient[o.clientId].paid++;
  });
  const cncClientRows = Object.entries(byCncClient).sort((a,b)=>b[1].income-a[1].income);

  // --- МАСТЕРА ---
  const empStats = {};
  DEFAULT_WORKERS.forEach(name => { empStats[name] = { set: new Set(), total: 0, types: {}, repairCount: 0, repairInc: 0, coatingInc: 0, orderDetails: [], repairDetails: [] }; });
  
  completedOrders.forEach(o => {
    const isL24 = o.location === "L24";
    const completionDate = o.workDoneDate || o.deliveryDate;
    const completionOk = inPeriod(completionDate);
    const isDelivered = !!deliveredOrders.find(d => d.id === o.id);

    (o.stages || []).forEach(s => {
      const stageRows = s?.rows ? s.rows : [{ employee: s?.employee, cost: s?.cost }];
      safeFilter(stageRows, r => r).forEach(row => {
        if (!row.employee || row.employee === MASTERS.OUTSOURCE || !row.cost) return;
        const e = row.employee;
        if (e === MASTERS.OLEG) { if (!completionOk) return; } 
        else { const othersOk = isL24 ? completionOk : isDelivered; if (!othersOk) return; }
        
        if (!empStats[e]) empStats[e] = { set: new Set(), total: 0, types: {}, repairCount: 0, repairInc: 0, coatingInc: 0, orderDetails: [], repairDetails: [] };
        const amt = isL24 ? (parseFloat(row.cost) || 0) * 0.8 : (parseFloat(row.cost) || 0);
        empStats[e].set.add(o.id); empStats[e].total += amt;
        empStats[e].types[s.type] = (empStats[e].types[s.type] || 0) + 1;
        empStats[e].orderDetails.push({ id: o.id + "_" + s.type + "_" + e, label: s.type + " · " + (o.orderTitle || o.clientName || o.serviceType || "Заказ"), amount: amt, date: completionDate || o.orderDate });
      });
    });
    
    const coatingOk = isL24 ? completionOk : isDelivered;
    if (coatingOk) {
      safeFilter(o.extras, ex => ex).forEach(ex => {
        if (ex.type !== "Покрытие" || !ex.coatingMaster || ex.coatingMaster === MASTERS.OUTSOURCE) return;
        const cm = ex.coatingMaster;
        const cmInc = isL24 ? (parseFloat(ex.coatingCost) || 0) * 0.8 : (parseFloat(ex.coatingCost) || 0);
        if (cmInc > 0) {
          if (!empStats[cm]) empStats[cm] = { set: new Set(), total: 0, types: {}, repairCount: 0, repairInc: 0, coatingInc: 0, orderDetails: [], repairDetails: [] };
          empStats[cm].total += cmInc; empStats[cm].coatingInc = (empStats[cm].coatingInc || 0) + cmInc;
          empStats[cm].types["Покрытие"] = (empStats[cm].types["Покрытие"] || 0) + 1;
          empStats[cm].orderDetails.push({ id: o.id + "_coat", label: `Покрытие: ${o.orderTitle || o.clientName || "заказ"}`, amount: cmInc, date: completionDate || o.orderDate, isCoating: true });
        }
      });
    }
  });

  // Экспорт в Excel (Динамическая подгрузка XLSX)
  const exportStats = (mode) => {
    const doExport = () => {
      const mn = mLabel(month);
      const wb = window.XLSX.utils.book_new();

      const summaryData = [
        ["Показатель", "Значение"],
        ["Период", statPeriodMode === "year" ? statYear : mn],
        ["Принято заказов", intakeOrders.length],
        ["Изг. изготовлено", completedOrders.length],
        ["Выдано", deliveredOrders.length],
        ["Общий доход мастерской", completedIncome.toFixed(2)],
        ["Доход с CNC", cncWsIncome.toFixed(2)],
        ["Поступило предоплат", prepayments.toFixed(2)],
        ["Поступило доплат", finalPayments.toFixed(2)],
        ["Итого фактических оплат", totalPaymentsIn.toFixed(2)],
      ];
      if (mode === "all" || stab === "summary") window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(summaryData), "Резюме");

      if (mode === "all" || stab === "finance") {
        const finData = [["Способ оплаты", "Сумма (€)"], ...Object.entries(payBreakdown).map(([m, v]) => [m, v.toFixed(2)])];
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(finData), "Финансы");
      }

      if (mode === "all" || stab === "sources") {
        const srcRows = [["Источник", "Заказов", "Сумма работ (€)", "Плановый доход (€)"], ...Object.entries(srcDetail).map(([src, d]) => [src, Object.values(d.types).reduce((s, v) => s + v, 0), d.workTotal.toFixed(2), d.income.toFixed(2)])];
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(srcRows), "Источники");
      }

      if (mode === "all" || stab === "employees") {
        const empRows = [["Мастер", "Заказов", "Заработок (€)", "Типы этапов"], ...Object.entries(empStats).map(([name, stat]) => [name, stat.set.size, stat.total.toFixed(2), Object.entries(stat.types || {}).map(([t, c]) => `${t}×${c}`).join(", ")])];
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(empRows), "Мастера");
      }

      if (mode === "all") {
        const ordRows = [["№", "Название", "Клиент", "Дата приёма", "Статус", "Источник", "Тип", "Сумма работ (€)", "Доход (€)"], ...intakeOrders.map(o => { const c = safeCalcOrder(o); return [o.orderNumber || "", o.orderTitle || "", o.clientName || "", o.orderDate, oStatus(o), o.source || "", o.serviceType || "", c.workTotal.toFixed(2), c.projectIncome.toFixed(2)]; })];
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(ordRows), "Заказы периода");
      }

      window.XLSX.writeFile(wb, `vaugold_stats_${statPeriodMode === "year" ? statYear : month}${mode === "current" ? "_" + stab : ""}.xlsx`);
    };

    if (window.XLSX) { doExport(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = doExport;
    document.head.appendChild(s);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* ФИЛЬТРЫ */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-[22px] border border-slate-100 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Финансовая аналитика</h2>
          <p className="text-xs text-slate-400 mt-0.5">Доходы, расходы, зарплаты и KPI мастерской</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${statPeriodMode === "month" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setStatPeriodMode("month")}>Месяц</button>
            <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${statPeriodMode === "year" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setStatPeriodMode("year")}>Год</button>
          </div>
          {statPeriodMode === "month" ? (
            <select className="border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer text-slate-700" value={month} onChange={e => setMonth(e.target.value)}>
              {monthOptions.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
            </select>
          ) : (
            <select className="border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold outline-none bg-white cursor-pointer text-slate-700" value={statYear} onChange={e => setStatYear(e.target.value)}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* НАВИГАЦИЯ И ЭКСПОРТ */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {[
            ["summary", "Резюме"], ["finance", "Оплаты"], ["sources", "Источники"], 
            ["services", "Изделия"], ["employees", "Мастера"], ["locations", "Точки"], 
            ["timing", "Сроки"], ["cnc", "CNC"]
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
        <div className="flex gap-2">
          <button className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-colors" onClick={() => exportStats("current")}>⬇ Эта вкладка</button>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-md" onClick={() => exportStats("all")}>⬇ Полный отчет</button>
        </div>
      </div>

      {/* КОНТЕНТ ВКЛАДОК */}
      <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
        
        {stab === "summary" && (
          <div className="space-y-8 animate-fade-in">
            {/* Карточки KPI */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Оборот (Брутто)</span>
                <span className="text-2xl font-black text-slate-800 block mt-1.5">{fmt(safeReduce(completedOrders, (s,o)=>s+safeCalcOrder(o).clientTotal, 0) + safeReduce(cncPaidMonth, (s,o)=>s+safeCalcCNC(o).clientTotal, 0) + repairIncome)}</span>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Чистый доход (До ЗП)</span>
                <span className="text-2xl font-black text-blue-600 block mt-1.5">{fmt(totalWsIncome)}</span>
              </div>
              <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Расходы (в т.ч. ЗП)</span>
                <span className="text-2xl font-black text-rose-600 block mt-1.5">{fmt(totalExp)}</span>
              </div>
              <div className="bg-slate-900 p-5 rounded-2xl shadow-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Прибыль (Нетто)</span>
                <span className={`text-2xl font-black block mt-1.5 ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(netProfit)}</span>
              </div>
            </div>

            {/* Детализация доходов */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Доход Изготовление</h3>
                <div className="text-3xl font-black text-slate-800 mb-4">{fmt(completedIncome)}</div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {completedOrders.map(o => {
                    const c = safeCalcOrder(o);
                    if (c.projectIncome <= 0) return null;
                    return (
                      <div key={o.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1.5 cursor-pointer hover:bg-slate-50 p-1 rounded" onClick={() => setStatModal({title:`💎 ${o.orderTitle || o.clientName}`, items:[{label:"Доход", amount: c.projectIncome}]})}>
                        <span className="truncate pr-2 text-slate-600 font-medium">{o.orderTitle || o.clientName}</span>
                        <span className="font-bold text-slate-900">{fmt(c.projectIncome)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Доход Ремонты</h3>
                <div className="text-3xl font-black text-slate-800 mb-4">{fmt(repairIncome)}</div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {deliveredRepairs.map(r => {
                    const inc = r.netIncome !== undefined ? r.netIncome : (r.totalPrice || 0) - (r.location === "L24" ? (r.totalPrice || 0) * L24_COMMISSION : 0);
                    if (inc <= 0) return null;
                    return (
                      <div key={r.id} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1.5 cursor-pointer hover:bg-slate-50 p-1 rounded" onClick={() => setStatModal({title:`🔧 ${r.clientName}`, items:[{label:"Доход", amount: inc}]})}>
                        <span className="truncate pr-2 text-slate-600 font-medium">{r.clientName}</span>
                        <span className="font-bold text-slate-900">{fmt(inc)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Поступления (Фактич.)</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                    <span className="text-xs font-bold text-slate-500 uppercase">Предоплаты</span>
                    <span className="font-bold text-slate-800">{fmt(prepayments)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                    <span className="text-xs font-bold text-slate-500 uppercase">Доплаты (Выдача)</span>
                    <span className="font-bold text-slate-800">{fmt(finalPayments)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                    <span className="text-xs font-bold text-slate-500 uppercase">Оплаты CNC</span>
                    <span className="font-bold text-slate-800">{fmt(cncPayments)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-3 rounded-xl mt-2">
                    <span className="text-xs font-bold text-emerald-700 uppercase">Итого зашло в кассу</span>
                    <span className="font-black text-emerald-600 text-lg">{fmt(totalPaymentsIn)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stab === "finance" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Методы оплаты ({periodLabel})</h3>
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                  <tr><th className="p-3">Способ</th><th className="p-3 text-right">Предоплаты</th><th className="p-3 text-right">Доплаты (Выдача)</th><th className="p-3 text-right">Итого</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {["Наличные", "Карта", "По банку", "Перевод"].map(m => {
                    const pre = prepayByMethod[m] || 0; const fin = finalByMethod[m] || 0;
                    if (!pre && !fin) return null;
                    return (
                      <tr key={m} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{m}</td>
                        <td className="p-3 text-right text-slate-500">{pre > 0 ? fmt(pre) : "—"}</td>
                        <td className="p-3 text-right text-slate-500">{fin > 0 ? fmt(fin) : "—"}</td>
                        <td className="p-3 text-right font-bold text-slate-900">{fmt(pre + fin)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50/50 border-t-2 border-slate-200">
                    <td className="p-3 font-bold text-slate-800">Итого</td>
                    <td className="p-3 text-right font-bold text-slate-800">{fmt(prepayments)}</td>
                    <td className="p-3 text-right font-bold text-slate-800">{fmt(finalPayments)}</td>
                    <td className="p-3 text-right font-black text-emerald-600">{fmt(totalPaymentsIn)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stab === "sources" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Источники трафика (Изготовление)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={Object.entries(srcDetail).sort((a,b)=>b[1].income-a[1].income).map(([src, d]) => [src, d.income])} colorClass="bg-blue-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Источник</th><th className="p-3">Заказов</th><th className="p-3 text-right text-blue-600 font-bold">План. Доход</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(srcDetail).sort((a,b)=>b[1].income-a[1].income).map(([src, d]) => (
                      <tr key={src} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{src}</td>
                        <td className="p-3 text-slate-500">{Object.values(d.types).reduce((s,v)=>s+v,0)}</td>
                        <td className="p-3 text-right font-bold text-blue-600">{fmt(d.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {stab === "services" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">По типу изделия (завершённые)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={typeRows.map(([t, v]) => [t, v.income])} colorClass="bg-indigo-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Тип</th><th className="p-3">Кол-во</th><th className="p-3 text-right">Доход</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {typeRows.map(([t, v]) => (
                      <tr key={t} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{t}</td>
                        <td className="p-3 text-slate-500">{v.count}</td>
                        <td className="p-3 text-right font-bold text-indigo-600">{fmt(v.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {stab === "employees" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Гонорары мастеров (По завершенным заказам)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={Object.entries(empStats).map(([m, v]) => [m, v.total])} colorClass="bg-indigo-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Мастер</th><th className="p-3">Работ</th><th className="p-3 text-right text-indigo-600 font-bold">К выплате</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(empStats).sort((a,b)=>b[1].total-a[1].total).map(([m, stat]) => (
                      <tr key={m} className="hover:bg-slate-50 cursor-pointer" onClick={() => setStatModal({
                        title: `👷 Мастер: ${m}`,
                        items: [...stat.orderDetails, ...stat.repairDetails].map(d => ({ label: d.label || d.repType, sub: fmtDate(d.date), amount: d.amount }))
                      })}>
                        <td className="p-3 font-semibold text-slate-700">{m}</td>
                        <td className="p-3 text-slate-500">{stat.set.size + stat.repairCount}</td>
                        <td className="p-3 text-right font-bold text-indigo-600">{fmt(stat.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-slate-50 p-3 text-xs text-slate-500 italic">
                  * Кликните на мастера для расшифровки начислений. Выплаты учитывают комиссию L24 (вычет 20% из ЗП).
                </div>
              </div>
            </div>
          </div>
        )}

        {stab === "locations" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Конверсия точек</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={byLocation.map(([l, v]) => [l === "L24" ? "L24 (субподряд)" : l, v.income])} colorClass="bg-emerald-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Точка</th><th className="p-3">Заказов</th><th className="p-3 text-right">Сумма (Брутто)</th><th className="p-3 text-right">Комиссия</th><th className="p-3 text-right text-emerald-600">Доход</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byLocation.map(([loc, v]) => (
                      <tr key={loc} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{loc === "L24" ? <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded">L24</span> : loc}</td>
                        <td className="p-3 text-slate-500">{v.orders + v.repairs}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{fmt(v.workTotal)}</td>
                        <td className="p-3 text-right text-amber-500">{v.l24commission > 0 ? `-${fmt(v.l24commission)}` : "—"}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">{fmt(v.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {stab === "timing" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Среднее время изготовления (Дней)</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={avgTimeRows.map(([t, days]) => [t, days])} colorClass="bg-amber-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Изделие</th><th className="p-3">Ср. дней</th><th className="p-3 text-right">Заказов</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {avgTimeRows.map(([t, days]) => (
                      <tr key={t} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{t}</td>
                        <td className="p-3 text-amber-600 font-bold">{days} дн.</td>
                        <td className="p-3 text-right text-slate-500">{typeTime[t].count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {stab === "cnc" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Аналитика направления CNC</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <BarChart data={cncClientRows.map(([c, v]) => [c, v.income])} colorClass="bg-blue-400" />
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                    <tr><th className="p-3">Клиент</th><th className="p-3">Заказов</th><th className="p-3 text-right text-blue-600">Доход</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cncClientRows.map(([c, v]) => (
                      <tr key={c} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-700">{c}</td>
                        <td className="p-3 text-slate-500">{v.count}</td>
                        <td className="p-3 text-right font-bold text-blue-600">{fmt(v.income)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

export default StatsTab;