// src/features/OrdersTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, fmtDate, oStatus } from '../utils/helpers';
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

      // Статус "Запрос" прячем из "Все", он только в своей вкладке
      if (statusFilter === "Все" && s === "Запрос") return false;

      // Логика неоплаченных (L24 проверяем отдельно по долгу, обычные - по балансу)
      if (statusFilter === "Неоплаченные") {
        const oc = calcOrder(o);
        const l24Unpaid = o.location === "L24" && o.paymentStatus !== "Оплачено" && oc.l24Remaining > 0;
        if (l24Unpaid) return true;
        return s !== "Выдано" && oc.balance > 0;
      }

      if (statusFilter === "L24") return o.location === "L24";
      if (statusFilter !== "Все" && s !== statusFilter) return false;
      return true;
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => [o.orderTitle, o.clientName, o.clientPhone, o.orderNumber].some(v => v && v.toLowerCase().includes(q)));
    }

    // Сортируем: новые сверху
    return list.sort((a, b) => (b.orderDate || "") > (a.orderDate || "") ? 1 : -1);
  }, [orders, statusFilter, search]);

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ЖУРНАЛ ЗАКАЗОВ */}
      <div className="mb-8">

        {/* Фильтры и Поиск */}
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">
          <div className="flex flex-wrap gap-2">
            {["Все", "В работе", "Изделие изготовлено", "Выдано", "Неоплаченные", "L24", "Черновики"].map(s => (
              <button 
                key={s} 
                onClick={() => setStatusFilter(s)} 
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === s ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {s === "Черновики" ? `📝 Черновики (${orders.filter(o => o.isDraft).length})` : 
                 s === "L24" ? `⚠ L24 (${orders.filter(o => o.location === "L24" && !o.isDraft).length})` : s}
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
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Клиенту</div>
                      <div className="text-lg font-black text-slate-800 leading-none">{fmt(oc.clientTotalWithVat)}</div>
                      {oc.balance > 0 && <div className="text-[10px] font-bold text-rose-500 mt-1">Остаток: {fmt(oc.balance)}</div>}
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