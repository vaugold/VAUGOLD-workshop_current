// src/features/OrdersTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, fmtDate, oStatus, mKey, mLabel } from '../utils/helpers';
import { calcOrder } from '../utils/calculations';

/**
 * ЖУРНАЛ ЗАКАЗОВ — только список заказов (изготовление).
 * Сама форма создания/редактирования заказа вынесена в OrderForm.jsx
 */
export const OrdersTab = ({
  orders = [], deleteOrder, onOpenViewer, onEditOrder, onOpenReceipt
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("В работе");
  const [search, setSearch] = useState("");

  // === ПЕРИОД (месяц/год) ===
  const now = new Date();
  const curYear = String(now.getFullYear());
  const curMonthKey = `${curYear}-${String(now.getMonth()+1).padStart(2,"0")}`;
  // Прошлый месяц
  const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
  // Список годов: от первого заказа до текущего + 1 вперёд
  const allYears = useMemo(() => {
    const ys = new Set([curYear, String(Number(curYear)+1)]);
    orders.forEach(o => { if (o.orderDate) ys.add(o.orderDate.slice(0,4)); });
    return Array.from(ys).sort((a,b) => b.localeCompare(a));
  }, [orders, curYear]);
  const allMonths = ["01","02","03","04","05","06","07","08","09","10","11","12"];

  const [periodMode, setPeriodMode] = useState("all");     // all | thisMonth | prevMonth | year | custom
  const [periodYear, setPeriodYear] = useState(curYear);
  const [periodMonth, setPeriodMonth] = useState(curMonthKey.slice(5,7));

  const inPeriod = date => {
    if (!date) return false;
    const k = date.slice(0,7);
    const y = date.slice(0,4);
    if (periodMode === "all") return true;
    if (periodMode === "thisMonth") return k === curMonthKey;
    if (periodMode === "prevMonth") return k === prevMonthKey;
    if (periodMode === "year") return y === periodYear;
    if (periodMode === "custom") return k === `${periodYear}-${periodMonth}`;
    return true;
  };
  const periodLabel = periodMode === "all" ? "Все даты"
    : periodMode === "thisMonth" ? `Текущий: ${mLabel(curMonthKey)}`
    : periodMode === "prevMonth" ? `Прошлый: ${mLabel(prevMonthKey)}`
    : periodMode === "year" ? `${periodYear} год`
    : `${mLabel(`${periodYear}-${periodMonth}`)}`;

  // Считаем сколько заказов в каждом периоде (для UI)
  const periodCount = useMemo(() => {
    return orders.filter(o => !o.isDraft && inPeriod(o.orderDate)).length;
  }, [orders, periodMode, periodYear, periodMonth]);

  /**
   * Умная фильтрация журнала заказов.
   * Учитывает поиск, статусы, черновики и специфичные выборки (L24/Неоплаченные).
   */
  const filteredOrders = useMemo(() => {
    let list = orders.filter(o => {
      const s = oStatus(o);
      // Черновики живут только в своей вкладке
      if (o.isDraft) return statusFilter === "Черновики";
      if (statusFilter === "Черновики") return false;

      // Статус "Запрос" — только в своей вкладке. Из остальных выпиливаем.
      if (statusFilter !== "Запрос" && s === "Запрос") return false;

      // Логика неоплаченных (L24 проверяем отдельно по долгу, обычные - по балансу)
      if (statusFilter === "Неоплаченные") {
        const oc = calcOrder(o);
        const l24Unpaid = o.location === "L24" && o.paymentStatus !== "Оплачено" && oc.l24Remaining > 0;
        if (l24Unpaid) return true;
        return s !== "Выдано" && oc.balance > 0;
      }

      if (statusFilter === "L24") return o.location === "L24";
      if (statusFilter === "Запрос") return s === "Запрос";
      if (statusFilter !== "Все" && s !== statusFilter) return false;
      return true;
    });

    // === Фильтр по периоду (по orderDate) ===
    if (periodMode !== "all") {
      list = list.filter(o => inPeriod(o.orderDate));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => [o.orderTitle, o.clientName, o.clientPhone, o.orderNumber].some(v => v && v.toLowerCase().includes(q)));
    }

    // Сортируем: новые сверху
    return list.sort((a, b) => (b.orderDate || "") > (a.orderDate || "") ? 1 : -1);
  }, [orders, statusFilter, search, periodMode, periodYear, periodMonth]);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ЖУРНАЛ ЗАКАЗОВ */}
      <div className="mb-8">

        {/* Фильтры и Поиск */}
        <div className="flex flex-col gap-4 mb-6 bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">

          {/* === Ряд 1: Период (месяц / год) === */}
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">📅 Период:</span>
            {[
              ["all", "Все даты"],
              ["thisMonth", `Текущий (${mLabel(curMonthKey)})`],
              ["prevMonth", `Прошлый (${mLabel(prevMonthKey)})`],
              ["year", "Год"],
              ["custom", "Месяц"]
            ].map(([id, lbl]) => (
              <button
                key={id}
                onClick={() => setPeriodMode(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  periodMode === id ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
            {periodMode === "year" && (
              <select className="ml-1 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer" value={periodYear} onChange={e => setPeriodYear(e.target.value)}>
                {allYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {periodMode === "custom" && (
              <div className="flex gap-1 ml-1">
                <select className="bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}>
                  {allMonths.map(m => <option key={m} value={m}>{mLabel(`${periodYear}-${m}`).split(" ")[0]}</option>)}
                </select>
                <select className="bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer" value={periodYear} onChange={e => setPeriodYear(e.target.value)}>
                  {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            <span className="ml-auto text-[10px] text-slate-400 italic">найдено за {periodLabel}: <strong className="text-slate-700">{periodCount}</strong></span>
          </div>

          {/* === Ряд 2: Статус + Поиск === */}
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {[
                ["Все", null],
                ["Запрос", orders.filter(o => !o.isDraft && oStatus(o) === "Запрос").length],
                ["В работе", null],
                ["Изделие изготовлено", null],
                ["Выдано", null],
                ["Неоплаченные", null],
                ["L24", null],
                ["Черновики", orders.filter(o => o.isDraft).length]
              ].map(([s, customCount]) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === s ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {s === "Черновики" ? `📝 Черновики (${customCount})` :
                   s === "L24" ? `⚠ L24 (${orders.filter(o => o.location === "L24" && !o.isDraft).length})` :
                   s === "Запрос" ? `🔍 Запрос (${customCount})` :
                   s}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Поиск (Имя, Телефон, №)..."
              className="w-full md:w-64 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Список карточек */}
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
              <span className="text-4xl block mb-3">📭</span>
              <p className="text-slate-400 font-medium">Нет заказов в этой категории</p>
            </div>
          ) : filteredOrders.map(o => {
            const oc = calcOrder(o);
            const st = oStatus(o);
            const isExp = expandedId === o.id;
            const isDraft = o.isDraft;

            return (
              <div key={o.id} className={`bg-white rounded-[20px] shadow-sm border overflow-hidden transition-all ${isDraft ? 'border-dashed border-slate-300 opacity-80' : 'border-slate-100 hover:shadow-md'}`}>
                
                {/* Шапка карточки */}
                <div className="p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between" onClick={() => setExpandedId(isExp ? null : o.id)}>
                  
                  <div className="flex items-center gap-4">
                    {/* Миниатюра — клик открывает галерею */}
                    {o.images?.length > 0 ? (
                      <div
                        className="w-14 h-14 rounded-xl overflow-hidden shadow-sm shrink-0 border border-slate-100 relative group cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); onOpenViewer && onOpenViewer(o.images, 0); }}
                      >
                        <img src={o.images[0]} alt="" className="w-full h-full object-cover" />
                        {o.images.length > 1 && <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">+{o.images.length - 1}</div>}
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-2xl text-slate-300">💍</div>
                    )}

                    {/* Инфо */}
                    <div>
                      {o.orderNumber && <span className="text-[10px] font-bold text-slate-400 block mb-0.5">№ {o.orderNumber}</span>}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-base">{o.orderTitle || o.clientName || "Без имени"}</span>
                        {isDraft && <span className="bg-slate-100 text-slate-500 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Черновик</span>}
                        {o.location === "L24" && <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">L24</span>}
                      </div>
                      <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
                        <span>{o.clientName} {o.clientPhone ? `· ${o.clientPhone}` : ''}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                        <span className="text-slate-600">{o.serviceType}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                        
                        {/* Статусы в виде красивых пиллов */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          st === 'Выдано' ? 'bg-slate-100 text-slate-500' :
                          st === 'Изделие изготовлено' ? 'bg-amber-100 text-amber-700' :
                          st === 'Запрос' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{st}</span>

                        {o.location === "L24" && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${o.paymentStatus === 'Оплачено' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {o.paymentStatus === 'Оплачено' ? '✓ Оплачено' : '⏳ Долг'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Финансы */}
                  <div className="flex items-center gap-6 text-right w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-none border-slate-100">
                    <div>
                      {/* === СТАТУС ОПЛАТЫ — всегда виден справа === */}
                      {o.paymentDate ? (
                        // Если стоит дата полной оплаты — заказ оплачен (не важно, выдан или нет)
                        <div className="bg-emerald-100 border-2 border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-lg mb-1.5 font-bold text-sm whitespace-nowrap">
                          ✓ Оплачено
                        </div>
                      ) : oc.balance > 0 ? (
                        <div className="bg-rose-100 border-2 border-rose-300 text-rose-800 px-3 py-1.5 rounded-lg mb-1.5 font-bold text-sm whitespace-nowrap">
                          ⚠ Остаток: {fmt(oc.balance)}
                        </div>
                      ) : null}

                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Клиенту</div>
                      <div className="text-lg font-black text-slate-800 leading-none">{fmt(oc.clientTotalWithVat)}</div>
                      {/* === ПРИХОД В КАССУ === */}
                      {parseFloat(o.prepayment) > 0 && (
                        <div className="text-[10px] font-bold text-blue-600 mt-1">
                          Аванс: {fmt(parseFloat(o.prepayment))}
                          {o.prepaymentDate && <span className="text-slate-400 font-normal"> · {fmtDate(o.prepaymentDate)}</span>}
                        </div>
                      )}
                      {parseFloat(o.prepayment) > oc.clientTotalWithVat && (
                        <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                          ⚠ Переплата: {fmt(parseFloat(o.prepayment) - oc.clientTotalWithVat)}
                        </div>
                      )}
                      {o.paymentDate && o.status !== "Выдано" && (
                        <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                          Оплачено: {fmtDate(o.paymentDate)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Прибыль</div>
                      <div className="text-lg font-black text-emerald-600 leading-none">{fmt(oc.projectIncome)}</div>
                    </div>
                    <div className="text-slate-300 bg-slate-50 w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300" style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0)' }}>
                      ▼
                    </div>
                  </div>

                </div>

                {/* Раскрытая детальная информация */}
                {isExp && (
                  <div className="p-6 border-t border-slate-100 bg-slate-50/50 animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Детали этапов и допов */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Калькуляция себестоимости</h4>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          {(o.stages || []).map((s, i) => {
                            if (s.rows) return s.rows.filter(r => parseFloat(r.cost) > 0).map((r, ri) => (
                              <div key={`${i}-${ri}`} className="flex justify-between border-b border-slate-50 pb-1.5">
                                <span>{ri === 0 ? s.type : <span className="text-slate-300 ml-4">↳ Мастер {ri+1}</span>} — <span className="font-semibold text-slate-800">{r.employee}</span></span>
                                <span className="font-bold">{fmt(r.cost)}</span>
                              </div>
                            ));
                            if (parseFloat(s.cost) > 0) return (
                              <div key={i} className="flex justify-between border-b border-slate-50 pb-1.5">
                                <span>{s.type} — <span className="font-semibold text-slate-800">{s.employee}</span></span>
                                <span className="font-bold">{fmt(s.cost)}</span>
                              </div>
                            );
                            return null;
                          })}
                          {(o.extras || []).filter(e => parseFloat(e.price) > 0 || parseFloat(e.cost) > 0).map((e, i) => (
                            <div key={`ex-${i}`} className="flex justify-between border-b border-slate-50 pb-1.5 pt-1">
                              <span className="italic text-slate-500">+ {e.type} ({e.description})</span>
                              <div className="text-right">
                                {parseFloat(e.price) > 0 && <span className="font-bold text-blue-600 ml-2">{fmt(e.price)}</span>}
                                {parseFloat(e.cost) > 0 && <span className="font-medium text-rose-400 ml-2 text-[10px]">(себест. -{fmt(e.cost)})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ТЗ и Комментарии */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {o.masterTask && (
                          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs text-emerald-900 shadow-sm">
                            <span className="block text-[10px] font-bold text-emerald-600 uppercase mb-1">ТЗ Мастеру:</span>
                            {o.masterTask}
                          </div>
                        )}
                        {o.comment && (
                          <div className="bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-600 shadow-sm">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Комментарий:</span>
                            {o.comment}
                          </div>
                        )}
                      </div>

                      {/* Фотографии изделия */}
                      {o.images?.length > 0 && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span>📷</span> Фотографии изделия ({o.images.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {o.images.map((img, i) => (
                              <div key={i} className="relative group">
                                <img
                                  src={img}
                                  alt={`Фото ${i + 1}`}
                                  onClick={(e) => { e.stopPropagation(); onOpenViewer && onOpenViewer(o.images, i); }}
                                  className="w-20 h-20 object-cover rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-80 hover:scale-105 transition-all shadow-sm"
                                />
                                {o.images.length > 1 && (
                                  <span className="absolute -top-1 -right-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{i + 1}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2">Нажмите на фото для увеличения</p>
                        </div>
                      )}
                    </div>

                    {/* Даты и Кнопки управления */}
                    <div className="flex flex-col justify-between space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2.5">
                        <div className="flex justify-between"><span className="text-slate-400">Принят:</span><span className="font-semibold">{fmtDate(o.orderDate)}</span></div>
                        {o.deadline && <div className="flex justify-between"><span className="text-slate-400">Дедлайн:</span><span className="font-bold text-rose-500">{fmtDate(o.deadline)}</span></div>}
                        {o.deadline3d && <div className="flex justify-between"><span className="text-slate-400">Дедлайн 3D:</span><span className="font-bold text-indigo-500">{fmtDate(o.deadline3d)}</span></div>}
                        {o.workDoneDate && <div className="flex justify-between"><span className="text-slate-400">Сделан:</span><span className="font-bold text-emerald-600">{fmtDate(o.workDoneDate)}</span></div>}
                        {o.deliveryDate && <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-400">Выдан клиенту:</span><span className="font-bold">{fmtDate(o.deliveryDate)}</span></div>}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-auto">
                        <button onClick={(e) => { e.stopPropagation(); onOpenReceipt && onOpenReceipt(o); }} className="bg-slate-800 text-white hover:bg-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">🧾 Чек</button>
                        <button onClick={(e) => { e.stopPropagation(); onEditOrder && onEditOrder(o); }} className="bg-slate-900 text-white hover:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">✏️ Редакт.</button>
                        <button onClick={(e) => { e.stopPropagation(); if (confirm("Точно удалить заказ? Это действие необратимо.")) deleteOrder(o.id); }} className="bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">🗑️ Удалить</button>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OrdersTab;