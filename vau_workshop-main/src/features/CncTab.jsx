// src/features/CncTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, fmtDate, generateId, todayStr, oStatus, isDone } from '../utils/helpers';
import { calcCNC } from '../utils/calculations';
import { MASTERS } from '../utils/constants';

import DateInput from '../components/DateInput';

const CNC_STATUSES = ["Запрос", "В работе", "Завершено", "Выдано"];

const emptyCNC = () => ({
  orderDate: todayStr(), deadline: "", deliveryDate: "", paymentDate: "",
  projectName: "", clientId: "", item: "", cuttingTime: "", modelTime: "", modelCost: "", cuttingCost: "",
  purchasedModel: "", purchasedModelCost: "",
  status: "В работе", paymentStatus: "Не оплачено", comment: "",
  images: []
});

const statusBorderClass = (status) => {
  if (status === "Запрос") return "border-l-4 border-l-amber-400";
  if (status === "В работе") return "border-l-4 border-l-blue-400";
  if (status === "Завершено" || status === "Выдано") return "border-l-4 border-l-slate-300";
  return "";
};

export const CncTab = ({
  cncOrders = [], setCncOrders,
  cncClients = [], setCncClients,
  cncItems = [], setCncItems,
  orders = [], updateOrder, editOrder,
  ensureOrderImages, // ИСПРАВЛЕНО 2026-06-27
  onOpenViewer
}) => {
  const [form, setForm] = useState(emptyCNC());
  const [view, setView] = useState("list");
  const [editingId, setEditingId] = useState(null);

  const [statusFilter, setStatusFilter] = useState("Все");
  const [payFilter, setPayFilter] = useState("Все");
  const [expanded, setExpanded] = useState(null);
  const [expandedVau, setExpandedVau] = useState(null);

  const [vauSort, setVauSort] = useState("deadline3d");
  const [cncSort, setCncSort] = useState("deadline");

  const [newClient, setNewClient] = useState("");
  const [newItem, setNewItem] = useState("");
  const [editingClientIdx, setEditingClientIdx] = useState(null);
  const [editingClientVal, setEditingClientVal] = useState({ name: "", phone: "" });
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [editingItemVal, setEditingItemVal] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.clientId || !form.item) return;
    if (editingId) {
      setCncOrders(cncOrders.map(o => o.id === editingId ? { ...form, id: editingId, ...calcCNC(form) } : o));
      setEditingId(null);
    } else {
      setCncOrders([{ ...form, id: Date.now(), ...calcCNC(form) }, ...cncOrders]);
    }
    setForm(emptyCNC());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setView("list");
  };

  const handleEdit = (o) => {
    setForm({ ...o });
    setEditingId(o.id);
    setView("new");
    setExpanded(null);
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => set("images", [...(form.images || []), ev.target.result]);
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  // Фильтрация CNC заказов
  const filtered = useMemo(() => {
    // CNC собственные заказы
    const cnc = cncOrders.filter(o => {
      if (statusFilter === "Все" && o.status === "Запрос") return false;
      if (statusFilter !== "Все" && o.status !== statusFilter) return false;
      if (payFilter !== "Все" && o.paymentStatus !== payFilter) return false;
      return true;
    }).map(o => ({ ...o, _src: "cnc" }));

    // VAU заказы из мастерской где Кирилл имеет оплачиваемый этап
    const vau = (orders || []).filter(o => {
      const kirillStage = (o.stages || []).find(s => s.employee === MASTERS.KIRILL && parseFloat(s.cost) > 0);
      if (!kirillStage) return false;
      if (statusFilter === "Все" && oStatus(o) === "Запрос") return false;
      if (statusFilter !== "Все" && oStatus(o) !== statusFilter) return false;
      return true;
    }).map(o => ({ ...o, _src: "vau" }));

    return [...cnc, ...vau].sort((a, b) => {
      const aDone = (a._src === "cnc" ? a.status : oStatus(a)) === "Выдано";
      const bDone = (b._src === "cnc" ? b.status : oStatus(b)) === "Выдано";
      if (aDone !== bDone) return aDone ? 1 : -1;

      const getDeadline = o => o._src === "vau" ? (o.deadline3d || "9999") : (o.deadline || "9999");
      if (cncSort === "deadline") {
        const da = getDeadline(a);
        const db = getDeadline(b);
        if (da !== db) return da > db ? 1 : -1;
      }
      return (b.orderDate || "") > (a.orderDate || "") ? 1 : -1;
    });
  }, [cncOrders, orders, statusFilter, payFilter, cncSort]);

  // VAU заказы (полный список для отдельной вкладки)
  const vauOrders = useMemo(() => {
    return (orders || []).filter(o => {
      const kirillStage = (o.stages || []).find(s => s.employee === MASTERS.KIRILL && parseFloat(s.cost) > 0);
      return !!kirillStage;
    }).sort((a, b) => {
      const aDone = oStatus(a) === "Завершено" || oStatus(a) === "Выдано";
      const bDone = oStatus(b) === "Завершено" || oStatus(b) === "Выдано";
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (vauSort === "deadline3d") {
        const da = a.deadline3d || "9999";
        const db = b.deadline3d || "9999";
        if (da !== db) return da > db ? 1 : -1;
      }
      return (b.orderDate || "") > (a.orderDate || "") ? 1 : -1;
    });
  }, [orders, vauSort]);

  const totalKirill = vauOrders.reduce((s, o) => {
    const ks = (o.stages || []).filter(st => st.employee === MASTERS.KIRILL).reduce((s2, st) => s2 + (parseFloat(st.cost) || 0), 0);
    return s + (o.location === "L24" ? ks * 0.8 : ks);
  }, 0);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Навигация внутри CNC */}
      <div className="flex flex-wrap gap-2 mb-2">
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "new" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => { setView("new"); setEditingId(null); setForm(emptyCNC()); }}>+ Новый</button>
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "list" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => setView("list")}>Заказы</button>
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "vau" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => setView("vau")}>VAU</button>
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "db" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => setView("db")}>База клиентов</button>
      </div>

      {/* ========== ФОРМА НОВОГО CNC ЗАКАЗА ========== */}
      {view === "new" && (
        <div className="bg-white p-6 md:p-8 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 relative">

          {editingId && (
            <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 rounded-t-[24px] px-6 py-3 flex justify-between items-center text-amber-700 font-semibold text-sm">
              <span>✏️ Редактирование CNC заказа</span>
              <button onClick={() => { setEditingId(null); setForm(emptyCNC()); setView("list"); }} className="bg-white border border-amber-300 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">Отмена</button>
            </div>
          )}

          {saved && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-semibold">
              ✓ {editingId ? "Изменения сохранены" : "Сохранён"}
            </div>
          )}

          <h2 className={`text-lg font-bold text-slate-800 tracking-tight mb-6 ${editingId ? 'mt-8' : ''}`}>
            {editingId ? "Детали CNC задачи" : "⚙️ CNC заказ"}
          </h2>

          <div className="space-y-6">
            {/* Название проекта */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Название проекта <span className="text-slate-300 font-normal normal-case">(необязательно)</span></label>
                <input type="text" placeholder="Напр: Кольцо с гравировкой для Марины" className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.projectName} onChange={e => set("projectName", e.target.value)} />
              </div>
            </div>

            {/* Даты и статусы */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дата заказа</label><DateInput value={form.orderDate} onChange={e => set("orderDate", e.target.value)} /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дедлайн</label><DateInput value={form.deadline} onChange={e => set("deadline", e.target.value)} /></div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Статус</label>
                <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none" value={form.status} onChange={e => set("status", e.target.value)}>
                  {CNC_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дата выдачи</label><DateInput value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дата оплаты</label><DateInput value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} /></div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Статус оплаты</label>
                <select className={`w-full px-3 py-2 rounded-lg text-sm font-bold outline-none border ${form.paymentStatus === 'Оплачено' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-rose-100 border-rose-300 text-rose-800'}`} value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}>
                  <option>Не оплачено</option><option>Оплачено</option>
                </select>
              </div>
            </div>

            {/* Клиент и изделие */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Клиент</label>
                <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.clientId} onChange={e => set("clientId", e.target.value)}>
                  <option value="">— выбрать —</option>
                  {cncClients.map((c, i) => { const n = typeof c === "string" ? c : c.name; return <option key={i} value={n}>{n}</option>; })}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Изделие</label>
                <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.item} onChange={e => set("item", e.target.value)}>
                  <option value="">— выбрать —</option>
                  {cncItems.map(it => <option key={it}>{it}</option>)}
                </select>
              </div>
            </div>

            {/* Время и стоимость */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Время резки (ч)</label><input type="number" step="0.5" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={form.cuttingTime} onChange={e => set("cuttingTime", e.target.value)} /></div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Стоимость резки (€)</label>
                    <input type="number" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none font-bold" value={form.cuttingCost} onChange={e => set("cuttingCost", e.target.value)} />
                    {parseFloat(form.cuttingTime) > 0 && parseFloat(form.cuttingCost) > 0 && <div className="text-[10px] text-slate-400 mt-1">≈ {fmt(parseFloat(form.cuttingCost) / parseFloat(form.cuttingTime))} €/ч</div>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Время 3D (ч)</label><input type="number" step="0.5" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={form.modelTime} onChange={e => set("modelTime", e.target.value)} /></div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Стоимость 3D (€)</label>
                    <input type="number" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none font-bold" value={form.modelCost} onChange={e => set("modelCost", e.target.value)} />
                    {parseFloat(form.modelTime) > 0 && parseFloat(form.modelCost) > 0 && <div className="text-[10px] text-slate-400 mt-1">≈ {fmt(parseFloat(form.modelCost) / parseFloat(form.modelTime))} €/ч</div>}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Закупленная модель</label><input type="text" placeholder="Напр: модель крест с орнаментом" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={form.purchasedModel} onChange={e => set("purchasedModel", e.target.value)} /></div>
                <div><label className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1 block">Стоимость закупки (€) <span className="text-rose-300 font-normal normal-case">(вычитается из дохода)</span></label><input type="number" className="w-full px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-sm outline-none font-bold text-rose-600" value={form.purchasedModelCost} onChange={e => set("purchasedModelCost", e.target.value)} /></div>
              </div>
            </div>

            {/* Комментарий и фото */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Комментарий</label>
                <textarea rows={4} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none" value={form.comment} onChange={e => set("comment", e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Фотографии</label>
                <div className="flex flex-wrap gap-3">
                  {(form.images || []).map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img} alt="" onClick={() => onOpenViewer && onOpenViewer(form.images, i)} className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm cursor-zoom-in" />
                      <button type="button" onClick={() => set("images", (form.images || []).filter((_, j) => j !== i))} className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md">&times;</button>
                    </div>
                  ))}
                  <label className="w-20 h-20 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 cursor-pointer">
                    <span className="text-2xl leading-none mb-1">+</span>
                    <span className="text-[10px] font-semibold">ФОТО</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                  </label>
                </div>
              </div>
            </div>

            {/* Расчёт */}
            {(parseFloat(form.cuttingCost) || parseFloat(form.modelCost)) > 0 && (() => {
              const c = calcCNC(form);
              return (
                <div className="bg-slate-900 text-white p-6 rounded-[24px] shadow-xl grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Расчёт для клиента</h4>
                    <div className="flex justify-between text-sm"><span>Стоимость модели:</span><span>{fmt(c.modelCost)}</span></div>
                    <div className="flex justify-between text-sm"><span>Стоимость резки:</span><span>{fmt(c.cuttingCost)}</span></div>
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-800">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Итого клиенту</span>
                      <span className="text-2xl font-serif text-emerald-400">{fmt(c.clientTotal)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Распределение</h4>
                    <div className="flex justify-between text-sm text-white"><span>Оплата клиента:</span><span>{fmt(c.clientTotal)}</span></div>
                    {c.purchasedModelCost > 0 && <div className="flex justify-between text-xs text-rose-400"><span>— Закупленная модель:</span><span>−{fmt(c.purchasedModelCost)}</span></div>}
                    <div className="flex justify-between text-sm font-semibold"><span>Чистый доход:</span><span>{fmt(c.netIncome)}</span></div>
                    <div className="flex justify-between text-sm text-emerald-400"><span>Доля мастерской (50%):</span><span>{fmt(c.workshopShare)}</span></div>
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-800">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Доля Кирилла (50%)</span>
                      <span className="text-xl font-black text-blue-400">{fmt(c.kirillShare)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button onClick={handleSave} disabled={!form.clientId || !form.item} className="bg-blue-600 text-white font-bold text-sm tracking-wide uppercase px-8 py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {editingId ? "💾 Сохранить изменения" : "✨ Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ЖУРНАЛ CNC (Заказы + VAU вместе) ========== */}
      {view === "list" && (
        <div className="mb-8">
          {/* Фильтры */}
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {["Все", ...CNC_STATUSES].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${statusFilter === s ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["Все", "Оплачено", "Не оплачено"].map(s => (
                  <button key={s} onClick={() => setPayFilter(s)} className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${payFilter === s ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <select value={cncSort} onChange={e => setCncSort(e.target.value)} className="w-full md:w-48 h-10 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500">
              <option value="deadline">↑ По дедлайну</option>
              <option value="date">↓ По дате (новые)</option>
            </select>
          </div>

          {/* Список заказов */}
          <div className="grid grid-cols-1 gap-4">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
                <span className="text-4xl block mb-3">🔧</span>
                <p className="text-slate-400 font-medium">Нет CNC заказов</p>
              </div>
            ) : filtered.map(o => {
              if (o._src === "vau") {
                // VAU заказ из мастерской
                const kirillCostRaw = (o.stages || []).filter(st => st.employee === MASTERS.KIRILL).reduce((s, st) => s + (parseFloat(st.cost) || 0), 0);
                const isL24vau = o.location === "L24";
                const kirillCost = isL24vau ? kirillCostRaw * 0.8 : kirillCostRaw;
                const kirillStages = (o.stages || []).filter(st => st.employee === MASTERS.KIRILL && parseFloat(st.cost) > 0);
                const st = oStatus(o);
                const isExp = expanded === o.id;
                const isClosed = st === "Завершено" || st === "Выдано";

                return (
                  <div key={"vau-" + o.id} className={`bg-white rounded-[20px] shadow-sm border overflow-hidden transition-all ${isClosed ? 'opacity-55' : 'hover:shadow-md'} ${statusBorderClass(st)}`}
                    style={isClosed ? { filter: "grayscale(0.3)" } : {}}
                    onClick={() => setExpanded(isExp ? null : o.id)}>

                    <div className="p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                      <div className="flex items-center gap-4">
                        {(o.images || []).length > 0 ? (
                          <div className="flex flex-col gap-1 shrink-0">
                            {o.images.slice(0, 3).map((img, i) => (
                              <img key={i} src={img} alt="" onClick={e => { e.stopPropagation(); onOpenViewer && onOpenViewer(o.images, i); }} className="w-11 h-11 object-cover rounded-lg border border-slate-200 cursor-pointer" />
                            ))}
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-2xl">💎</div>
                        )}

                        <div>
                          {o.orderNumber && <div className="text-[10px] font-bold text-slate-400 mb-0.5">№ {o.orderNumber}</div>}
                          <div className="font-bold text-slate-800 text-base">{o.orderTitle || o.clientName || "Без названия"}</div>
                          <div className="text-xs text-slate-500 font-medium mb-1">{o.clientName}{o.clientName && o.serviceType ? " · " : ""}{o.serviceType}</div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${st === 'Выдано' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>{st}</span>
                            <span className="bg-slate-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">VAU</span>
                            {o.location && o.location !== "Vaugold" && <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">{o.location}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-0.5">Доля Кирилла</div>
                          <div className="text-lg font-black text-blue-600 leading-none">{fmt(kirillCost)}</div>
                          {isL24vau && <div className="text-[9px] font-bold text-amber-500 mt-1">−20%</div>}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 pb-3 text-xs text-slate-500 flex flex-wrap gap-3">
                      <span>📅 {fmtDate(o.orderDate)}</span>
                      {o.deadline && <span>⏰ {fmtDate(o.deadline)}</span>}
                      {o.deadline3d && <span className="text-blue-600 font-semibold">3D {fmtDate(o.deadline3d)}</span>}
                    </div>

                    {isExp && (
                      <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                        {kirillStages.map((s, i) => (
                          <div key={i} className="flex justify-between border-b border-slate-100 py-2">
                            <span className="text-xs text-slate-600">{s.type}</span>
                            <span className="text-xs font-bold text-blue-600">{fmt(s.cost)}</span>
                          </div>
                        ))}
                        {o.masterTask && <div className="mt-3 p-3 bg-emerald-50 border-l-3 border-emerald-400 rounded-r-lg text-xs">📋 {o.masterTask}</div>}

                        {/* Фотографии изделия */}
                        {o.images?.length > 0 && (
                          <div className="mt-4 bg-white p-4 rounded-xl border border-slate-200">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <span>📷</span> Фотографии ({o.images.length})
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
                    )}
                  </div>
                );
              }

              // Обычный CNC заказ
              const c = calcCNC(o);
              const isExp = expanded === o.id;

              return (
                <div key={o.id} className={`bg-white rounded-[20px] shadow-sm border overflow-hidden transition-all hover:shadow-md ${statusBorderClass(o.status)}`} onClick={() => setExpanded(isExp ? null : o.id)}>
                  <div className="p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex items-center gap-4">
                      {(o.images || []).length > 0 ? (
                        <div className="flex flex-col gap-1 shrink-0">
                          {o.images.slice(0, 3).map((img, i) => (
                            <img key={i} src={img} alt="" onClick={e => { e.stopPropagation(); onOpenViewer && onOpenViewer(o.images, i); }} className="w-11 h-11 object-cover rounded-lg border border-slate-200 cursor-pointer" />
                          ))}
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 text-2xl">⚙️</div>
                      )}

                      <div>
                        <div className="font-bold text-slate-800 text-base">{o.projectName || o.item}</div>
                        <div className="text-xs text-slate-500 font-medium mb-1">{o.projectName ? `${o.item} · ` : ""}{o.clientId}</div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${o.status === 'Выдано' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>{o.status}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${o.paymentStatus === 'Оплачено' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{o.paymentStatus === 'Оплачено' ? '✓ Оплачено' : '⏳ Долг'}</span>
                          {o.deadline && new Date(o.deadline) < new Date() && o.status !== "Выдано" && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-700">⚠ Просрочен</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Итого</div>
                        <div className="text-lg font-black text-slate-800 leading-none">{fmt(c.clientTotal)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-0.5">Кирилл</div>
                        <div className="text-lg font-black text-blue-600 leading-none">{fmt(c.kirillShare)}</div>
                        {c.isL24 && <div className="text-[9px] font-bold text-amber-500 mt-1">(−20%)</div>}
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-3 text-xs text-slate-500 flex flex-wrap gap-3">
                    <span>📅 {fmtDate(o.orderDate)}</span>
                    {o.deadline && <span>⏰ {fmtDate(o.deadline)}</span>}
                    {o.modelTime && <span>🖥 {o.modelTime}ч (3D)</span>}
                    {o.cuttingTime && <span>⚙ {o.cuttingTime}ч</span>}
                  </div>

                  {isExp && (
                    <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between border-b border-slate-200/60 pb-1.5 text-xs"><span>Стоимость модели</span><span className="font-bold text-rose-500">−{fmt(c.modelCost)}</span></div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-1.5 text-xs"><span>Стоимость резки</span><span className="font-bold">{fmt(c.cuttingCost)}</span></div>
                      {c.purchasedModelCost > 0 && <div className="flex justify-between border-b border-slate-200/60 pb-1.5 text-xs text-rose-500"><span>Закупка ({o.purchasedModel || 'модель'})</span><span className="font-bold">−{fmt(c.purchasedModelCost)}</span></div>}
                      <div className="flex justify-between border-b border-slate-200/60 pb-1.5 font-bold pt-2 text-xs"><span>Чистый доход</span><span>{fmt(c.netIncome)}</span></div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-1.5 text-xs text-emerald-600 font-bold"><span>Доля мастерской</span><span>{fmt(c.workshopShare)}</span></div>
                      <div className="flex justify-between text-xs text-blue-600 font-bold"><span>Доля Кирилла</span><span>{fmt(c.kirillShare)}</span></div>
                      {o.deliveryDate && <div className="flex justify-between border-t border-slate-100 pt-2 text-xs"><span>Выдан</span><span>{fmtDate(o.deliveryDate)}</span></div>}
                      {o.paymentDate && <div className="flex justify-between text-xs"><span>Оплачен</span><span>{fmtDate(o.paymentDate)}</span></div>}
                      {o.comment && <div className="mt-3 p-3 bg-white rounded-lg text-xs text-slate-500 italic border">💬 {o.comment}</div>}

                      {/* Фотографии изделия */}
                      {o.images?.length > 0 && (
                        <div className="mt-4 bg-white p-4 rounded-xl border border-slate-200">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span>📷</span> Фотографии ({o.images.length})
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

                      <div className="flex gap-2 justify-end mt-4">
                        <button onClick={e => { e.stopPropagation(); handleEdit(o); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-xs font-bold transition-colors">✏️ Изменить</button>
                        <button onClick={e => { e.stopPropagation(); if (confirm("Удалить?")) setCncOrders(cncOrders.filter(x => x.id !== o.id)); }} className="bg-white border border-rose-100 text-rose-500 hover:bg-rose-50 px-4 py-2 rounded-xl text-xs font-bold transition-colors">Удалить</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========== VAU (отдельная вкладка) ========== */}
      {view === "vau" && (
        <div className="mb-8">
          <div className="bg-slate-900 rounded-[20px] p-6 mb-6 flex flex-col md:flex-row justify-between items-center shadow-lg">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">VAU — заказы мастерской</h3>
              <p className="text-xs text-slate-400 mt-1">Заказы где Кирилл назначен на этап</p>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Кириллу:</span>
              <span className="text-2xl font-black text-blue-400">{fmt(totalKirill)}</span>
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <select value={vauSort} onChange={e => setVauSort(e.target.value)} className="w-full md:w-48 h-10 px-4 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
              <option value="deadline3d">↑ По дедлайну 3D</option>
              <option value="date">↓ По дате (новые)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {vauOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
                <span className="text-4xl block mb-3">💎</span>
                <p className="text-slate-400 font-medium">Нет заказов с работой Кирилла</p>
              </div>
            ) : vauOrders.map(o => {
              const kirillCostRaw = (o.stages || []).filter(st => st.employee === MASTERS.KIRILL).reduce((s, st) => s + (parseFloat(st.cost) || 0), 0);
              const isL24vau = o.location === "L24";
              const kirillCost = isL24vau ? kirillCostRaw * 0.8 : kirillCostRaw;
              const kirillStages = (o.stages || []).filter(st => st.employee === MASTERS.KIRILL && parseFloat(st.cost) > 0);
              const st = oStatus(o);
              const isExp = expandedVau === o.id;

              return (
                <div key={o.id} className={`bg-white rounded-[20px] shadow-sm border overflow-hidden transition-all hover:shadow-md ${statusBorderClass(st)}`}
                  style={{ cursor: "pointer" }} onClick={() => setExpandedVau(isExp ? null : o.id)}>

                  <div className="p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex items-center gap-4">
                      {(o.images || []).length > 0 ? (
                        <div className="flex flex-col gap-1 shrink-0">
                          {o.images.slice(0, 3).map((img, i) => (
                            <img key={i} src={img} alt="" onClick={e => { e.stopPropagation(); onOpenViewer && onOpenViewer(o.images, i); }} className="w-11 h-11 object-cover rounded-lg border border-slate-200 cursor-pointer" />
                          ))}
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-2xl">💎</div>
                      )}

                      <div>
                        {o.orderNumber && <div className="text-[10px] font-bold text-slate-400 mb-0.5">№ {o.orderNumber}</div>}
                        <div className="font-bold text-slate-800 text-base">{o.orderTitle || o.clientName || "Без названия"}</div>
                        <div className="text-xs text-slate-500 font-medium mb-1">{o.clientName}{o.clientName && o.serviceType ? " · " : ""}{o.serviceType}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="bg-slate-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Мастерская</span>
                          {o.location && o.location !== "Vaugold" && <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">{o.location}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-0.5">Доля Кирилла</div>
                      <div className="text-lg font-black text-blue-600 leading-none">{fmt(kirillCost)}</div>
                      {isL24vau && <div className="text-[9px] font-bold text-amber-500 mt-1">−20%</div>}
                    </div>
                  </div>

                  <div className="px-5 pb-3 text-xs text-slate-500 flex flex-wrap gap-3">
                    <span>📅 {fmtDate(o.orderDate)}</span>
                    {o.deadline && <span>⏰ {fmtDate(o.deadline)}</span>}
                    {o.deadline3d && (() => {
                      const now = new Date(); now.setHours(0, 0, 0, 0);
                      const dl = new Date(o.deadline3d + "T00:00:00");
                      const daysLeft = Math.ceil((dl - now) / 86400000);
                      const done = isDone(st) || st === "Выдано";
                      if (done) return <span className="text-emerald-600 font-semibold">3D ✓</span>;
                      if (daysLeft < 0) return <span className="text-rose-600 font-bold">3D ⚠ просрочен {Math.abs(daysLeft)}д.</span>;
                      if (daysLeft === 0) return <span className="text-rose-500 font-bold">3D сегодня!</span>;
                      if (daysLeft === 1) return <span className="text-amber-500 font-semibold">3D завтра ({fmtDate(o.deadline3d)})</span>;
                      return <span className={daysLeft <= 3 ? "text-amber-500" : "text-slate-400"}>3D {daysLeft}д. ({fmtDate(o.deadline3d)})</span>;
                    })()}
                  </div>

                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                    {kirillStages.map((s, i) => (
                      <div key={i} className="flex justify-between items-center py-1.5">
                        <span className="text-xs text-slate-600 flex items-center gap-2">
                          {s.type}
                          {s.type === "Модель / резка" && o.deadline3d && (() => {
                            const now = new Date(); now.setHours(0, 0, 0, 0);
                            const dl = new Date(o.deadline3d + "T00:00:00");
                            const daysLeft = Math.ceil((dl - now) / 86400000);
                            const done = isDone(st) || st === "Выдано";
                            if (done) return <span className="text-emerald-600 text-[10px] font-medium">3D ✓ {fmtDate(o.deadline3d)}</span>;
                            const col = daysLeft < 0 ? "text-rose-600" : daysLeft <= 1 ? "text-rose-500" : daysLeft <= 3 ? "text-amber-500" : "text-blue-500";
                            const daysTxt = daysLeft < 0 ? `просрочен ${Math.abs(daysLeft)}д.` : daysLeft === 0 ? "сегодня!" : daysLeft === 1 ? "завтра" : `${daysLeft}д.`;
                            return <span className={`${col} text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded`}>{daysTxt} {fmtDate(o.deadline3d)}</span>;
                          })()}
                        </span>
                        <span className="text-xs font-bold text-blue-600">{fmt(s.cost)}</span>
                      </div>
                    ))}
                  </div>

                  {isExp && (
                    <div className="p-5 border-t border-slate-100 bg-slate-50/80">
                      {o.masterTask && (
                        <div className="mb-4">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">ТЗ</div>
                          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs">{o.masterTask}</div>
                        </div>
                      )}

                      {/* Фотографии изделия */}
                      {o.images?.length > 0 && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span>📷</span> Фотографии ({o.images.length})
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
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========== БАЗА КЛИЕНТОВ ========== */}
      {view === "db" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-4">Клиенты CNC</h3>
            <div className="space-y-2 mb-4">
              {cncClients.map((c, i) => {
                const name = typeof c === "string" ? c : c.name;
                const phone = typeof c === "string" ? "" : c.phone || "";
                const isEditing = editingClientIdx === i;

                return (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                    {isEditing ? (
                      <>
                        <input className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none" value={editingClientVal.name} onChange={e => setEditingClientVal(p => ({ ...p, name: e.target.value }))} />
                        <input className="w-24 px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none" value={editingClientVal.phone} placeholder="+372..." onChange={e => setEditingClientVal(p => ({ ...p, phone: e.target.value }))} />
                        <button className="text-emerald-600 font-bold px-2" onClick={() => { const up = [...cncClients]; up[i] = { name: editingClientVal.name, phone: editingClientVal.phone }; setCncClients(up); setEditingClientIdx(null); }}>✓</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-semibold text-slate-700">{name}</span>
                        <span className="text-xs text-slate-400 w-24">{phone}</span>
                        <button className="text-slate-400 hover:text-blue-500" onClick={() => { setEditingClientIdx(i); setEditingClientVal({ name, phone }); }}>✏️</button>
                        <button className="text-slate-400 hover:text-rose-500 font-bold text-lg px-2 leading-none" onClick={() => setCncClients(cncClients.filter((_, j) => j !== i))}>&times;</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Имя клиента" value={newClient} onChange={e => setNewClient(e.target.value)} />
              <button className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold" onClick={() => { if (newClient.trim()) { setCncClients([...cncClients, { name: newClient.trim(), phone: "" }]); setNewClient(""); } }}>Добавить</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-4">Изделия CNC</h3>
            <div className="space-y-2 mb-4">
              {cncItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                  {editingItemIdx === i ? (
                    <>
                      <input className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none" value={editingItemVal} onChange={e => setEditingItemVal(e.target.value)} />
                      <button className="text-emerald-600 font-bold px-2" onClick={() => { const up = [...cncItems]; up[i] = editingItemVal; setCncItems(up); setEditingItemIdx(null); }}>✓</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold text-slate-700">{it}</span>
                      <button className="text-slate-400 hover:text-blue-500" onClick={() => { setEditingItemIdx(i); setEditingItemVal(it); }}>✏️</button>
                      <button className="text-slate-400 hover:text-rose-500 font-bold text-lg px-2 leading-none" onClick={() => setCncItems(cncItems.filter((_, j) => j !== i))}>&times;</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Новое изделие" value={newItem} onChange={e => setNewItem(e.target.value)} />
              <button className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold" onClick={() => { if (newItem.trim()) { setCncItems([...cncItems, newItem.trim()]); setNewItem(""); } }}>Добавить</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CncTab;