// src/features/RepairsTab.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { fmt, fmtDate, generateId, todayStr, addWorkdays, generateOrderNumber } from '../utils/helpers';
import { REPAIR_CATEGORIES, DEFAULT_WORKERS } from '../utils/constants';
import { useAuth } from '../context/AuthContext';

// Подключаем компоненты
import ClientSearch from '../components/ClientSearch';
import DateInput from '../components/DateInput';
import DraftBanner from '../components/DraftBanner';
import { useAutoSave } from '../hooks/useAutoSave';

// --- КОНСТАНТЫ РЕМОНТОВ ---
const LOCATIONS = ["Vaugold", "Sikupilli", "L24"];
const PAY_METHODS = ["Sularaha", "Kaart EM", "Kaart VG", "Pank EM", "Pank VG"];
const REPAIR_RECEPTION_STATUSES = ["Принято", "Передано мастеру", "Выдано клиенту"];
const REPAIR_MASTER_STATUSES = ["В работе", "Ремонт готов"];
const EXTRA_TYPES = ["Аутсорс", "Металл", "Камни", "Фурнитура", "Покрытие", "Другое"];
const COATING_TYPES = ["Valge roodium", "Must roodium", "Ruteenium", "Kullatud", "Hõbetatud"];
const METAL_TYPES = ["Kuld", "Hõbe"];
const MASTERS = ["Oleg", "Kseniya", "Sofia", "Astarot", "Outsource"];

// Эстонские переводы для чека
const REPAIR_ET_MAP = {
  "Пайка": "Jootmine",
  "Увеличение / Уменьшение": "Suuruse muutmine",
  "Полировка / Мойка": "Poleerimine / puhastamine",
  "Ремонт замка / Замена": "Luku parandus/vahetus",
  "Закрепка камней": "Kivi paigaldus",
  "Золочение / Родий": "Katmine (ródium/kullamine)",
  "Гравировка": "Graveerimine",
  "Эмалирование": "Emaili restaureerimine",
  "Сложный ремонт": "Muu remont",
  "Прочее": "Muu remont"
};

/**
 * ==========================================
 * КОМПОНЕНТ ПЕЧАТИ ЧЕКА (REPAIR RECEIPT)
 * ==========================================
 * Вшит прямо сюда, чтобы не плодить файлы. 
 * Использует чистый CSS для идеальной конвертации в PDF/Печать.
 */
const RepairReceipt = ({ repair, onClose }) => {
  const [mode, setMode] = useState("client"); 
  const [copies, setCopies] = useState(1);

  const items = repair.items || [];
  const totalPrice = items.reduce((s, it) => s + (parseFloat(it.price) || 0) + (it.extras || []).reduce((s2, e) => s2 + (parseFloat(e.price) || 0), 0), 0);
  const vat = repair.vatEnabled ? totalPrice * 0.24 : 0;
  const totalWithVat = repair.totalWithVat || (totalPrice + vat);
  const prepayment = parseFloat(repair.prepayment) || 0;
  const balance = repair.balanceWithVat || (totalWithVat - prepayment);

  const payEt = { "Наличные": "Sularaha", "Карта": "Kaardimakse", "По банку": "Pangaülekanne" };

  // CSS для печати чека (чтобы принтер не резал стили)
  const RECEIPT_CSS = `
    .r-wrap { font-family: "DM Sans", sans-serif; background: #fff; max-width: 380px; margin: 0 auto; color: #333; padding: 20px; }
    .r-reg { font-size: 10px; color: #555; line-height: 1.8; }
    .r-hr { border: none; border-top: 1px solid #aaa; margin: 10px 0; }
    .r-lbl { font-size: 8px; font-weight: 400; text-transform: uppercase; letter-spacing: .09em; color: #999; margin-bottom: 2px; margin-top: 8px; }
    .r-val { font-size: 13px; color: #2C1F33; margin-bottom: 2px; font-weight: 500; }
    .r-total-box { border: 1.5px solid #555; border-radius: 4px; padding: 12px 14px; margin-top: 10px; }
    .r-trow { display: flex; justify-content: space-between; font-size: 12px; color: #826B87; padding: 2px 0; }
    .r-trow-big { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #111; padding-top: 8px; margin-top: 6px; border-top: 2px solid #333; }
    .r-date { font-size: 10px; color: #555; margin-top: 12px; }
    @media print { .no-print { display: none !important; } .ov { background: transparent !important; position: static !important; } }
  `;

  const doPrint = () => {
    const style = document.createElement("style");
    style.id="__rr_copies";
    style.textContent = copies > 1 ? ".r-wrap { page-break-after: always; }" : "";
    document.head.appendChild(style);
    
    const wrap = document.querySelector(".rr-wrap");
    const origHTML = wrap ? wrap.innerHTML : "";
    if (copies > 1 && wrap) { let r=""; for(let i=0;i<copies;i++) r+=origHTML; wrap.innerHTML=r; }
    
    window.print();
    
    if (copies > 1 && wrap) wrap.innerHTML = origHTML;
    document.getElementById("__rr_copies")?.remove();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-[9999] flex items-start justify-center p-4 pt-[15vh] overflow-y-auto ov" onClick={onClose}>
      <style>{RECEIPT_CSS}</style>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Кнопки управления чеком (Скрываются при печати) */}
        <div className="flex gap-2 p-4 border-b border-slate-100 bg-slate-50 no-print sticky top-0 z-10">
          <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "client" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`} onClick={() => setMode("client")}>Клиенту</button>
          <button className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${mode === "master" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"}`} onClick={() => setMode("master")}>Мастеру</button>
        </div>

        {/* Тело чека */}
        <div className="rr-wrap">
          <div className="r-wrap">
            <div style={{ fontSize: 19, fontWeight: 600, color: "#2C1F33" }}>VAUGOLD OÜ</div>
            <div className="r-reg">Reg. nr 16997581 &nbsp;·&nbsp; Tel +372 56662363</div>
            <hr className="r-hr" />
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              {repair.orderNumber && <div style={{ fontSize: 18, fontWeight: "bold" }}>Nr {repair.orderNumber}</div>}
              <div className="r-date" style={{ marginTop: 0 }}>{fmtDate(repair.orderDate)}</div>
            </div>

            <div className="r-lbl">Klient</div>
            <div className="r-val">{repair.clientName} {repair.clientPhone ? `· ${repair.clientPhone}` : ''}</div>

            <div className="r-lbl" style={{ marginTop: 12 }}>Remondid / Repairs</div>
            {items.map((it, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: "bold", color: "#2C1F33" }}>
                  <span>{i+1}. {REPAIR_ET_MAP[it.type] || it.type} {it.withStones && <span style={{ fontSize: 9 }}>[Kividega]</span>}</span>
                  {mode === "client" && <span>{fmt(it.price)}</span>}
                </div>
                {it.weight && <div style={{ fontSize: 11, color: "#888", paddingLeft: 14 }}>Kaal / Weight: {it.weight} g</div>}
                
                {mode === "master" && it.masterTask && (
                  <div style={{ fontSize: 11, background: "#f8f9fa", padding: "4px 8px", borderLeft: "2px solid #333", marginTop: 4 }}>
                    <strong>ТЗ:</strong> {it.masterTask}
                  </div>
                )}
              </div>
            ))}

            {mode === "client" && (
              <div className="r-total-box">
                {vat > 0 && <div className="r-trow"><span>Summa ilma KM-ta</span><span>{fmt(totalPrice)}</span></div>}
                {vat > 0 && <div className="r-trow"><span>KM 24%</span><span>+{fmt(vat)}</span></div>}
                <div className="r-trow-big"><span>Tasuda kokku</span><span>{fmt(totalWithVat)}</span></div>
                
                {prepayment > 0 && (
                  <>
                    <div className="r-trow" style={{ marginTop: 7 }}>
                      <span>Ettemaks · <span style={{ fontSize: 10 }}>{payEt[repair.paymentMethod]}</span></span>
                      <span>−{fmt(prepayment)}</span>
                    </div>
                    <div className="r-trow-big" style={{ borderTop: "1px dashed #777", paddingTop: 5 }}>
                      <span>Järelejääv summa</span><span>{fmt(balance)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="r-date" style={{ marginTop: 16 }}>Vastuvõtmise kuupäev: {fmtDate(repair.orderDate)}</div>
            {repair.deliveryDate && <div className="r-date">Eeldatav väljaandmise: {fmtDate(repair.deliveryDate)}</div>}
            
            <div style={{ marginTop: 24, borderTop: "1px dashed #ccc", paddingTop: 16, fontSize: 10, color: "#555" }}>
              Kinnitan, et remont on teostatud nõuetekohases korras ning toode on tagastatud ja kätte saadud.
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30 }}>
                <div style={{ borderTop: "1px solid #333", width: "60%", paddingTop: 4 }}>Allkiri / Signature</div>
                <div style={{ borderTop: "1px solid #333", width: "30%", paddingTop: 4 }}>Kuupäev</div>
              </div>
            </div>

          </div>
        </div>

        {/* Панель печати */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 mt-auto no-print">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-slate-500">Копий:</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => setCopies(n)} className={`w-8 h-8 rounded-lg font-bold text-sm transition-colors ${copies === n ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm bg-white hover:bg-slate-50 transition-colors">Отмена</button>
            <button onClick={doPrint} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md">🖨️ Печать</button>
          </div>
        </div>

      </div>
    </div>
  );
};


/**
 * ==========================================
 * ОСНОВНОЙ КОМПОНЕНТ ВКЛАДКИ РЕМОНТОВ
 * ==========================================
 */

// Генератор пустой позиции внутри ремонта
const emptyRepairItem = () => ({
  type: "",
  comment: "",
  masterTask: "",
  weight: "",
  price: "",
  extras: [],
  taskImages: [],
  // Соисполнители: [{ name: "Oleg", percent: 50 }]
  workers: []
});

// Генератор каркаса всего ремонта (с автогенерацией номера)
const createEmptyRepair = (orderNumber = "", userRole = 'superuser') => ({
  orderNumber: orderNumber, clientName: "", clientPhone: "", clientEmail: "",
  orderDate: todayStr(), deadline: addWorkdays(todayStr(), 5), delivery: "",
  receptionStatus: "Принято", masterStatus: "",
  returnedToPoint: false,
  location: userRole === 'master_sikupilli' ? 'Sikupilli' : 'Vaugold',
  pickupPoint: userRole === 'master_sikupilli' ? 'Sikupilli' : 'Vaugold', // Пункт выдачи
  isRepeat: "Новый", source: "", projectName: "", crossSell: false,
  comment: "", images: [],
  prepayment: "", paymentMethod: "Sularaha", finalPaymentMethod: "Sularaha", vatEnabled: false,
  l24PaymentStatus: "Не оплачено", l24PaymentDate: "",
  items: [emptyRepairItem()],
});


export const RepairsTab = ({ repairs = [], setRepairs, allOrders = [], allCnc = [], sources = [], onOpenViewer }) => {
  // Получаем текущего пользователя для генерации номера заказа
  const { currentUser } = useAuth();

  // Функция для генерации нового номера заказа
  const getNewRepairNumber = () => {
    const role = currentUser?.role || 'superuser';
    return generateOrderNumber(repairs, role);
  };

  // Инициализация формы
  const [form, setForm] = useState(createEmptyRepair(getNewRepairNumber(), currentUser?.role));
  const [editingId, setEditingId] = useState(null);
  const [view, setView] = useState("new");
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("Все");
  const [repairReceipt, setRepairReceipt] = useState(null);

  // Автосохранение черновика
  const isEditing = !!editingId;
  const { draft, save, lastSaved, showBanner, setShowBanner, clear: clearDraft } = useAutoSave('repair', () => createEmptyRepair(getNewRepairNumber(), currentUser?.role));

  // Применяем черновик при первой загрузке
  useEffect(() => {
    if (draft && !editingId && view === "new") {
      setForm(draft);
    }
  }, [draft, editingId, view]);

  // Автосохранение при изменении формы (только для новых)
  useEffect(() => {
    if (!isEditing && view === "new") {
      const timer = setTimeout(() => save(form), 1500);
      return () => clearTimeout(timer);
    }
  }, [form, save, isEditing, view]);

  // Универсальный сеттер свойств ремонта
  const set = (k, v) => setForm(p => {
    const next = { ...p, [k]: v };
    // Автоматическая смена статусов мастера при смене статуса приемщика
    if (k === "receptionStatus" && v === "Передано мастеру" && !next.masterStatus) next.masterStatus = "В работе";
    if (k === "receptionStatus" && v === "Принято") next.masterStatus = "";
    // Автоматический пересчет дедлайна (+5 раб. дней) при смене даты заказа
    if (k === "orderDate" && v) {
      const defaultDl = addWorkdays(p.orderDate, 5);
      if (!p.deadline || p.deadline === defaultDl) next.deadline = addWorkdays(v, 5);
    }
    return next;
  });

  // Управление массивом позиций ремонта (один чек может содержать 3 разных ремонта)
  const setItem = (i, k, v) => { const it = [...form.items]; it[i] = { ...it[i], [k]: v }; set("items", it); };
  const addItem = () => set("items", [...form.items, emptyRepairItem()]);
  const removeItem = i => set("items", form.items.filter((_, j) => j !== i));
  
  // Управление доп. позициями (расходники) внутри конкретного ремонта
  const setItemExtra = (ii, ei, k, v) => { 
    const it = [...form.items]; 
    const ex = [...(it[ii].extras || [])]; 
    ex[ei] = { ...ex[ei], [k]: v }; 
    it[ii] = { ...it[ii], extras: ex }; 
    set("items", it); 
  };
  const addItemExtra = (ii) => { 
    const it = [...form.items]; 
    it[ii] = { ...it[ii], extras: [...(it[ii].extras || []), { description: "", type: "", price: "", cost: "" }] }; 
    set("items", it); 
  };
  const removeItemExtra = (ii, ei) => {
    const it = [...form.items];
    it[ii] = { ...it[ii], extras: (it[ii].extras || []).filter((_, j) => j !== ei) };
    set("items", it);
  };

  // --- УПРАВЛЕНИЕ СОИСПОЛНИТЕЛЯМИ ---
  // Добавить соисполнителя к позиции
  const addWorker = (itemIndex) => {
    const it = [...form.items];
    const item = { ...it[itemIndex] };
    const workers = [...(item.workers || [])];

    // Если основной мастер еще не в списке и выбран - добавляем его первым с 50%
    if (item.masterName && !workers.find(w => w.name === item.masterName)) {
      const oldPercent = workers.length > 0 ? Math.floor(100 / (workers.length + 2)) : 50;

      // Пересчитываем существующих
      const redistributedWorkers = workers.map((w, idx) => ({
        ...w,
        percent: idx === workers.length - 1 ? oldPercent : Math.floor(100 / (workers.length + 2))
      }));

      // Добавляем основного мастера
      redistributedWorkers.push({ name: item.masterName, percent: oldPercent });

      // Находим свободного мастера для соисполнителя
      const usedNames = redistributedWorkers.map(w => w.name);
      const availableMasters = MASTERS.filter(m => !usedNames.includes(m) && m !== item.masterName);
      const defaultMaster = availableMasters[0] || MASTERS.find(m => !usedNames.includes(m)) || "Outsource";

      redistributedWorkers.push({ name: defaultMaster, percent: oldPercent });

      // Выравниваем сумму до 100%
      const total = redistributedWorkers.reduce((s, w) => s + w.percent, 0);
      if (total !== 100) {
        redistributedWorkers[redistributedWorkers.length - 1].percent += (100 - total);
      }

      item.workers = redistributedWorkers;
    } else {
      // Просто добавляем нового соисполнителя
      const usedNames = workers.map(w => w.name);
      const availableMasters = MASTERS.filter(m => !usedNames.includes(m));
      const defaultMaster = availableMasters[0] || MASTERS[0];

      // Делим между всеми (включая основного, если он уже в списке)
      const newCount = workers.length + 2; // +1 основной, +1 новый
      const basePercent = Math.floor(100 / newCount);

      const newWorkers = workers.map((w, idx) => ({
        ...w,
        percent: idx === workers.length - 1 ? basePercent : Math.floor(100 / newCount)
      }));

      newWorkers.push({ name: defaultMaster, percent: basePercent });

      // Выравниваем
      const total = newWorkers.reduce((s, w) => s + w.percent, 0);
      if (total !== 100) {
        newWorkers[newWorkers.length - 1].percent += (100 - total);
      }

      item.workers = newWorkers;
    }

    it[itemIndex] = item;
    set("items", it);
  };

  // Обновить процент конкретного соисполнителя
  const updateWorkerPercent = (itemIndex, workerIndex, newPercent) => {
    const it = [...form.items];
    const item = { ...it[itemIndex] };
    const workers = [...(item.workers || [])];
    workers[workerIndex] = { ...workers[workerIndex], percent: parseInt(newPercent) || 0 };
    item.workers = workers;
    it[itemIndex] = item;
    set("items", it);
  };

  // Обновить имя соисполнителя
  const updateWorkerName = (itemIndex, workerIndex, newName) => {
    const it = [...form.items];
    const item = { ...it[itemIndex] };
    const workers = [...(item.workers || [])];
    workers[workerIndex] = { ...workers[workerIndex], name: newName };
    item.workers = workers;
    it[itemIndex] = item;
    set("items", it);
  };

  // Удалить соисполнителя
  const removeWorker = (itemIndex, workerIndex) => {
    const it = [...form.items];
    const item = { ...it[itemIndex] };
    const workers = [...(item.workers || [])];
    workers.splice(workerIndex, 1);

    // Пересчитываем проценты
    if (workers.length === 1) {
      workers[0].percent = 100;
    } else if (workers.length > 1) {
      // Перераспределяем поровну
      const basePercent = Math.floor(100 / workers.length);
      workers.forEach((w, idx) => {
        w.percent = idx === workers.length - 1 ? basePercent + (100 - basePercent * workers.length) : basePercent;
      });
    }

    item.workers = workers;
    it[itemIndex] = item;
    set("items", it);
  };

  // Очистить всех соисполнителей (вернуть к основному мастеру)
  const clearWorkers = (itemIndex) => {
    const it = [...form.items];
    const item = { ...it[itemIndex] };
    item.workers = [];
    it[itemIndex] = item;
    set("items", it);
  };

  // --- ФИНАНСОВЫЕ РАСЧЕТЫ (Реактивные) ---
  const extrasPrice = form.items.reduce((s, it) => (it.extras || []).reduce((s2, e) => s2 + (parseFloat(e.price) || 0), s), 0);
  const extrasCost  = form.items.reduce((s, it) => (it.extras || []).reduce((s2, e) => s2 + (parseFloat(e.cost) || 0), s), 0);
  const totalPrice = form.items.reduce((s, it) => s + (parseFloat(it.price) || 0), 0) + extrasPrice;
  const prepayment = parseFloat(form.prepayment) || 0;
  const balance = totalPrice - prepayment;
  const vat = form.vatEnabled ? totalPrice * 0.24 : 0;
  const totalWithVat = totalPrice + vat;
  const balanceWithVat = totalWithVat - prepayment;
  const isL24Repair = form.location === "L24";
  const l24RepairCommission = isL24Repair ? totalPrice * 0.20 : 0;
  const repairNetIncome = totalPrice - extrasCost - l24RepairCommission;

  // --- СОХРАНЕНИЕ ---
  const handleSave = (e, isDraft = false) => {
    if (e) e.preventDefault();
    if (!form.clientName && !form.clientPhone) {
      alert("Укажите клиента");
      return;
    }

    const data = {
      ...form, isDraft, totalPrice, prepayment, balance, vat, totalWithVat, balanceWithVat,
      extrasPrice, extrasCost, l24Commission: l24RepairCommission, netIncome: repairNetIncome
    };

    if (editingId) {
      setRepairs(repairs.map(x => x.id === editingId ? { ...data, id: editingId } : x));
      setEditingId(null);
    } else {
      setRepairs([{ ...data, id: generateId() }, ...repairs]);
    }
    setForm(createEmptyRepair(getNewRepairNumber()));
    setView("list");
    clearDraft(); // Очищаем черновик после успешного сохранения
  };

  const handleEdit = r => {
    setForm({ ...createEmptyRepair(""), ...r });
    setEditingId(r.id);
    setView("new");
    setExpandedId(null);
    clearDraft(); // Очищаем автосохранение при редактировании
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRepair = id => {
    if (confirm("Удалить этот ремонт?")) setRepairs(repairs.filter(x => x.id !== id));
  };

  // Умная фильтрация журнала
  const filteredRepairs = useMemo(() => {
    return repairs.filter(r => {
      if (r.isDraft) return statusFilter === "Черновики";
      if (statusFilter === "Черновики") return false;
      if (statusFilter === "Все") return true;
      if (statusFilter === "Ремонт готов") return r.masterStatus === "Ремонт готов" && r.receptionStatus !== "Выдано клиенту";
      if (REPAIR_RECEPTION_STATUSES.includes(statusFilter)) return r.receptionStatus === statusFilter;
      if (REPAIR_MASTER_STATUSES.includes(statusFilter)) return r.masterStatus === statusFilter;
      return true;
    }).sort((a, b) => (b.orderDate || "") > (a.orderDate || "") ? 1 : -1);
  }, [repairs, statusFilter]);

  const draftRepairs = repairs.filter(r => r.isDraft);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Баннер восстановленного черновика */}
      {showBanner && (
        <DraftBanner
          show={showBanner}
          lastSaved={lastSaved}
          onClear={() => {
            clearDraft();
            setForm(createEmptyRepair(getNewRepairNumber(), currentUser?.role));
          }}
          onDismiss={() => {
            clearDraft(); // Также очищаем при закрытии
          }}
        />
      )}

      {/* Навигация */}
      <div className="flex gap-2 mb-4">
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "new" ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => { setView("new"); setEditingId(null); setForm(createEmptyRepair(getNewRepairNumber(), currentUser?.role)); }}>+ Новый ремонт</button>
        <button className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${view === "list" ? "bg-slate-800 text-white shadow-md" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"}`} onClick={() => setView("list")}>Журнал ({repairs.length})</button>
      </div>

      {view === "new" && (
        <div className="bg-white p-6 md:p-8 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 relative">
          
          {editingId && (
            <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 rounded-t-[24px] px-6 py-3 flex justify-between items-center text-amber-700 font-semibold text-sm">
              <span>✏️ Редактирование ремонта № {form.orderNumber || "—"}</span>
              <button onClick={() => { setEditingId(null); setForm(createEmptyRepair(getNewRepairNumber(), currentUser?.role)); setView("list"); }} className="bg-white border border-amber-300 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">Отмена</button>
            </div>
          )}

          <h2 className={`text-lg font-bold text-slate-800 tracking-tight mb-6 ${editingId ? 'mt-8' : ''}`}>
            {editingId ? "Детали ремонта" : "🔧 Оформление ремонта"}
          </h2>

          <form onSubmit={e => handleSave(e, false)} className="space-y-8">
            
            {/* БЛОК 1: ОСНОВНАЯ ИНФОРМАЦИЯ И КЛИЕНТ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Основное</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">№ квитанции</label>
                    <input type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.orderNumber} onChange={e => set("orderNumber", e.target.value)} placeholder="R-001" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Точка</label>
                    <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={form.location} onChange={e => set("location", e.target.value)}>
                      {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Название (необязательно)</label>
                    <input type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.projectName} onChange={e => set("projectName", e.target.value)} placeholder="Напр: Реставрация кольца бабушки" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Источник</label>
                    <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none" value={form.source} onChange={e => set("source", e.target.value)}>
                      <option value="">— выбрать —</option>
                      {(sources || []).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border border-slate-200 p-5 rounded-2xl">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Клиент</h3>
                <ClientSearch 
                  clientName={form.clientName} 
                  clientPhone={form.clientPhone} 
                  clientEmail={form.clientEmail}
                  allHistory={[...allOrders, ...repairs, ...allCnc]}
                  onSelect={data => {
                    const isRpt = data.clientPhone ? [...allOrders, ...repairs, ...allCnc].some(o => o.clientPhone === data.clientPhone && o.id !== editingId) : false;
                    setForm(p => ({ ...p, ...data, isRepeat: isRpt ? "Повторный" : "Новый" }));
                  }}
                />
                <div className="flex justify-between items-center pt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={form.crossSell} onChange={e => set("crossSell", e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    <span className="font-semibold">Cross-Sell</span>
                  </label>
                  {form.isRepeat === "Повторный" && <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded border border-emerald-200">↩ Повторный</span>}
                </div>
              </div>

            </div>

            {/* БЛОК 2: ДАТЫ И СТАТУСЫ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Принят</label><DateInput value={form.orderDate} onChange={e => set("orderDate", e.target.value)} /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Выдан</label><DateInput value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} /></div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Приемщик</label>
                <select className={`w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none border ${form.receptionStatus === "Принято" ? "bg-blue-50 border-blue-200 text-blue-700" : form.receptionStatus === "Передано мастеру" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-300 text-slate-500"}`} value={form.receptionStatus} onChange={e => set("receptionStatus", e.target.value)}>
                  {REPAIR_RECEPTION_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Статус мастера</label>
                <select className={`w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none border ${form.masterStatus === "Ремонт готов" ? "bg-amber-50 border-amber-200 text-amber-700" : form.masterStatus === "В работе" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200"}`} value={form.masterStatus} onChange={e => set("masterStatus", e.target.value)}>
                  <option value="">— не задан —</option>
                  {REPAIR_MASTER_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {form.masterStatus === "Ремонт готов" && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Пункт выдачи</label>
                  <select className="w-full px-3 py-2 rounded-lg text-sm font-semibold outline-none border bg-white border-slate-200" value={form.pickupPoint} onChange={e => set("pickupPoint", e.target.value)}>
                    <option value="Sikupilli">Sikupilli</option>
                    <option value="Vaugold">Vaugold</option>
                  </select>
                </div>
              )}
            </div>

            {/* БЛОК 3: ПОЗИЦИИ РЕМОНТА (КОРЗИНА) */}
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Позиции ремонта (Что нужно сделать)</h3>
                <button type="button" onClick={addItem} className="text-xs bg-white border border-slate-300 text-slate-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors shadow-sm">+ Добавить позицию</button>
              </div>

              {form.items.map((it, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 relative shadow-sm">
                  {form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="absolute top-3 right-3 text-slate-300 hover:text-rose-500 font-bold text-lg leading-none">&times;</button>}
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pr-6">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Категория</label>
                      <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={it.type} onChange={e => setItem(i, "type", e.target.value)}>
                        <option value="">— выбрать —</option>
                        {REPAIR_CATEGORIES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Мастер (кто делает)</label>
                      <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={it.masterName || ""} onChange={e => setItem(i, "masterName", e.target.value)}>
                        <option value="">— не задан —</option>
                        {[...DEFAULT_WORKERS, "Аутсорс"].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Работа мастера (€)</label>
                      <input type="number" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none font-bold" value={it.price} onChange={e => setItem(i, "price", e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Вес изделия (g)</label>
                      <input type="text" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={it.weight} onChange={e => setItem(i, "weight", e.target.value)} placeholder="0.00 g" />
                    </div>
                  </div>

                  {/* СОИСПОЛНИТЕЛИ */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Исполнители ({parseFloat(it.price) || 0}€)</span>
                      <div className="flex gap-2">
                        {(it.workers || []).length > 0 && (
                          <button type="button" onClick={() => clearWorkers(i)} className="text-sm bg-slate-100 text-slate-500 font-bold px-3 py-2 rounded-lg hover:bg-slate-200">× Отменить</button>
                        )}
                        <button type="button" onClick={() => addWorker(i)} className="text-sm bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors">+ Соисполнитель</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {/* Показываем основного мастера (всегда) */}
                      {it.masterName && (
                        <div className="flex gap-2 items-center bg-slate-50/50 p-3 rounded-lg border border-slate-200 text-sm">
                          <div className="flex-1">
                            <span className="text-slate-600 font-medium">Основной: <strong>{it.masterName}</strong></span>
                          </div>
                          {(it.workers || []).length > 0 ? (
                            <span className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded">
                              {it.workers.find(w => w.name === it.masterName)?.percent || 50}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">100%</span>
                          )}
                          <span className="text-slate-700 font-bold">
                            {it.price ? (parseFloat(it.price) * ((it.workers || []).length > 0 ? (it.workers.find(w => w.name === it.masterName)?.percent || 50) : 100) / 100).toFixed(2) : '0.00'}€
                          </span>
                        </div>
                      )}

                      {/* Соисполнители */}
                      {(it.workers || []).filter(w => w.name !== it.masterName).map((worker, wi) => {
                        const workerShare = it.price ? Math.round(parseFloat(it.price) * worker.percent / 100 * 100) / 100 : 0;
                        return (
                          <div key={`co-${wi}`} className="flex gap-2 items-center bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 text-sm">
                            <select
                              className="px-3 py-2 text-sm bg-white border border-emerald-200 text-emerald-700 rounded-lg outline-none font-medium"
                              value={worker.name}
                              onChange={e => updateWorkerName(i, it.workers.findIndex(w => w.name === worker.name), e.target.value)}
                            >
                              <option value="">Выбрать</option>
                              {MASTERS.filter(m => m !== it.masterName).map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              className="w-20 px-3 py-2 text-sm bg-white border border-emerald-200 text-emerald-700 rounded-lg outline-none text-center font-bold"
                              value={worker.percent}
                              onChange={e => updateWorkerPercent(i, it.workers.findIndex(w => w.name === worker.name), e.target.value)}
                            />
                            <span className="text-emerald-600 font-medium">%</span>
                            <div className="flex-1 text-right">
                              <span className="text-emerald-700 font-bold">{workerShare.toFixed(2)}€</span>
                            </div>
                            <button type="button" onClick={() => removeWorker(i, it.workers.findIndex(w => w.name === worker.name))} className="text-emerald-400 hover:text-rose-500 font-bold text-xl px-2">&times;</button>
                          </div>
                        );
                      })}

                      {/* Подсказка если нет основного мастера */}
                      {!it.masterName && (!it.workers || it.workers.length === 0) && (
                        <div className="text-[10px] text-slate-400 italic">Сначала выберите основного мастера</div>
                      )}
                    </div>
                  </div>

                  {/* Доп позиции внутри этого ремонта (Металл, покрытие) */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Расходники для этой позиции</span>
                      <button type="button" onClick={() => addItemExtra(i)} className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded hover:bg-slate-200">+ Расходник</button>
                    </div>
                    
                    <div className="space-y-2">
                      {(it.extras || []).map((ex, ei) => {
                        const isCoating = ex.type === "Покрытие";
                        return (
                          <div key={ei} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <select className="w-24 px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded outline-none" value={ex.type} onChange={e => setItemExtra(i, ei, "type", e.target.value)}>
                              <option value="">Тип</option>{EXTRA_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                            <input type="text" placeholder="Описание" className="flex-1 px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded outline-none" value={ex.description} onChange={e => setItemExtra(i, ei, "description", e.target.value)} />
                            <input type="number" placeholder="Себест." className="w-20 px-2 py-1.5 text-[10px] bg-white border border-rose-100 text-rose-600 rounded outline-none text-right font-bold" value={ex.cost} onChange={e => setItemExtra(i, ei, "cost", e.target.value)} />
                            <input type="number" placeholder="Клиенту" className="w-20 px-2 py-1.5 text-[10px] bg-white border border-emerald-100 text-emerald-600 rounded outline-none text-right font-bold" value={ex.price} onChange={e => setItemExtra(i, ei, "price", e.target.value)} />
                            
                            {isCoating && (
                              <>
                                <select className="w-20 px-2 py-1.5 text-[10px] bg-white border border-indigo-200 text-indigo-700 rounded outline-none" value={ex.coatingMaster || ""} onChange={e => setItemExtra(i, ei, "coatingMaster", e.target.value)}>
                                  <option value="">Мастер</option>
                                  {["Ксения", "Олег", "Аутсорс"].map(m => <option key={m}>{m}</option>)}
                                </select>
                                <input type="number" placeholder="ЗП/Аутс." className="w-16 px-2 py-1.5 text-[10px] bg-white border border-indigo-200 text-indigo-700 rounded outline-none text-right" value={ex.coatingMasterCost || ""} onChange={e => setItemExtra(i, ei, "coatingMasterCost", e.target.value)} />
                              </>
                            )}

                            <button type="button" onClick={() => removeItemExtra(i, ei)} className="text-slate-400 hover:text-rose-500 font-bold px-1">&times;</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ТЗ для мастера по конкретно этому ремонту */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">ТЗ Мастеру</label>
                      <textarea rows={2} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none resize-none" value={it.masterTask} onChange={e => setItem(i, "masterTask", e.target.value)} placeholder="Что именно нужно сделать..." />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Комментарий (клиента)</label>
                      <textarea rows={2} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none resize-none" value={it.comment} onChange={e => setItem(i, "comment", e.target.value)} placeholder="Жалобы, особенности..." />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* БЛОК 4: ФИНАНСЫ И ОПЛАТА */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-6">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Аванс (€)</label><input type="number" min="0" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none font-bold text-slate-700" value={form.prepayment} onChange={e => set("prepayment", e.target.value)} /></div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Способ аванса</label>
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Способ доплаты</label>
                    <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" value={form.finalPaymentMethod} onChange={e => set("finalPaymentMethod", e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer p-2 bg-blue-50 border border-blue-100 rounded-lg w-max">
                  <input type="checkbox" checked={form.vatEnabled} onChange={e => set("vatEnabled", e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-xs font-bold text-blue-900">Учесть НДС 24% к чеку</span>
                </label>

                {form.location === "L24" && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3 mt-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-amber-700 uppercase mb-1 block">Оплата от L24</label>
                      <select className={`w-full px-2 py-1.5 rounded-lg text-xs font-bold border ${form.l24PaymentStatus === 'Оплачено' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-rose-100 border-rose-300 text-rose-800'}`} value={form.l24PaymentStatus} onChange={e => set("l24PaymentStatus", e.target.value)}>
                        <option>Не оплачено</option><option>Оплачено</option>
                      </select>
                    </div>
                    <div className="flex-1"><label className="text-[10px] font-bold text-amber-700 uppercase mb-1 block">Дата оплаты</label><DateInput value={form.l24PaymentDate} onChange={e => set("l24PaymentDate", e.target.value)} className="!border-amber-300 !py-1.5 !text-xs" /></div>
                  </div>
                )}
              </div>

              {/* Резюме расчета (Справа) */}
              <div className="bg-slate-900 text-white p-6 rounded-[24px] shadow-xl">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Стоимость работ:</span><span className="font-semibold">{fmt(totalPrice - extrasPrice)}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Доп. позиции:</span><span className="font-semibold">{fmt(extrasPrice)}</span></div>
                {form.vatEnabled && <div className="flex justify-between text-sm text-blue-400 mb-2"><span>НДС (24%):</span><span className="font-semibold">+{fmt(vat)}</span></div>}
                
                <div className="border-t border-slate-700 my-3 pt-3 flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Итого клиенту</span>
                  <span className="text-2xl font-serif font-black text-emerald-400">{fmt(totalWithVat)}</span>
                </div>
                {balance > 0 && <div className="flex justify-between text-xs text-rose-300 font-bold mt-1"><span>Остаток к доплате:</span> <span>{fmt(balanceWithVat)}</span></div>}
                
                <div className="border-t border-slate-700 my-3 pt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Себестоимость расходников:</span><span>-{fmt(extrasCost)}</span></div>
                  {isL24Repair && <div className="flex justify-between text-xs text-amber-400 font-bold mb-1"><span>Комиссия L24 (20%):</span><span>-{fmt(l24RepairCommission)}</span></div>}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Доход мастерской</span>
                    <span className="text-lg font-bold text-white">{fmt(repairNetIncome)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
              <button type="button" onClick={e => handleSave(e, true)} className="flex-1 border-2 border-dashed border-slate-300 text-slate-500 font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-colors">
                📝 Сохранить как черновик
              </button>
              <button type="submit" className="flex-1 bg-blue-600 text-white font-bold text-sm tracking-wide uppercase px-6 py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                {editingId ? "💾 Сохранить изменения" : "✨ Создать ремонт"}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ЖУРНАЛ РЕМОНТОВ */}
      {view === "list" && (
        <div className="mb-8">
          
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6 bg-white p-4 rounded-[20px] shadow-sm border border-slate-100">
            <div className="flex flex-wrap gap-2">
              {["Все", ...REPAIR_RECEPTION_STATUSES, ...REPAIR_MASTER_STATUSES].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === s ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                  {s}
                </button>
              ))}
              <button onClick={() => setStatusFilter("Черновики")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === "Черновики" ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                📝 Черновики ({draftRepairs.length})
              </button>
              <button onClick={() => setStatusFilter("Sikupilli")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === "Sikupilli" ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                📍 Sikupilli ({repairs.filter(r => r.pickupPoint === 'Sikupilli').length})
              </button>
              <button onClick={() => setStatusFilter("Vaugold")} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${statusFilter === "Vaugold" ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                📍 Vaugold ({repairs.filter(r => r.pickupPoint === 'Vaugold').length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredRepairs.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-100">
                <span className="text-4xl block mb-3">📭</span>
                <p className="text-slate-400 font-medium">Нет ремонтов в этой категории</p>
              </div>
            ) : filteredRepairs.map(r => {
              const isExp = expandedId === r.id;
              const isDraft = r.isDraft;

              return (
                <div key={r.id} className={`bg-white rounded-[20px] shadow-sm border overflow-hidden transition-all ${isDraft ? 'border-dashed border-slate-300 opacity-80' : 'border-slate-100 hover:shadow-md'}`}>
                  <div className="p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center justify-between" onClick={() => setExpandedId(isExp ? null : r.id)}>
                    
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-2xl text-slate-300">🔧</div>
                      <div>
                        {r.orderNumber && <span className="text-[10px] font-bold text-slate-400 block mb-0.5">№ {r.orderNumber}</span>}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-800 text-base">{r.clientName || "Без имени"}</span>
                          {isDraft && <span className="bg-slate-100 text-slate-500 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Черновик</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 flex-wrap">
                          <span>{(r.items || []).map(it => it.type).filter(Boolean).slice(0, 2).join(", ") || "Ремонт"}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            r.receptionStatus === 'Выдано клиенту' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                          }`}>{r.receptionStatus}</span>
                          {r.masterStatus && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${r.masterStatus === 'Ремонт готов' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{r.masterStatus}</span>}
                          {r.pickupPoint && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${r.pickupPoint === 'Sikupilli' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>📍 {r.pickupPoint}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-none border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Сумма</div>
                        <div className="text-lg font-black text-slate-800 leading-none">{fmt(r.totalWithVat || r.totalPrice)}</div>
                      </div>
                    </div>
                  </div>

                  {isExp && (
                    <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-6 animate-fade-in">
                      <div className="flex-1 space-y-4">
                        {(r.items || []).map((it, i) => (
                          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200">
                            <div className="flex justify-between items-start mb-2">
                              <span className="font-bold text-slate-800">{it.type || `Ремонт #${i+1}`}</span>
                              {it.masterName && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">{it.masterName}</span>}
                            </div>

                            {/* Соисполнители в журнале */}
                            {(it.workers || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {it.workers.map((w, wi) => (
                                  <span key={wi} className="text-[9px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-medium border border-emerald-100">
                                    {w.name} ({w.percent}%)
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="text-xs text-slate-600 flex justify-between border-b border-slate-50 pb-1.5 mb-1.5"><span>Стоимость работы:</span><span className="font-bold">{fmt(it.price)}</span></div>
                            {it.weight && <div className="text-xs text-slate-600 flex justify-between"><span>Вес:</span><span>{it.weight} g</span></div>}
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                          <div className="flex justify-between"><span className="text-slate-400">Принят:</span><span className="font-semibold">{fmtDate(r.orderDate)}</span></div>
                          {r.deadline && <div className="flex justify-between"><span className="text-slate-400">Дедлайн:</span><span className="font-bold text-rose-500">{fmtDate(r.deadline)}</span></div>}
                          {r.deliveryDate && <div className="flex justify-between pt-2 border-t border-slate-100"><span className="text-slate-400">Выдан клиенту:</span><span className="font-bold">{fmtDate(r.deliveryDate)}</span></div>}
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-4">
                          <button onClick={(e) => { e.stopPropagation(); setRepairReceipt(r); }} className="bg-slate-900 text-white hover:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">🧾 Чек</button>
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(r); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">✏️ Изменить</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteRepair(r.id); }} className="bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 py-2.5 rounded-xl text-xs font-bold transition-colors w-full text-center">🗑️ Удалить</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {repairReceipt && <RepairReceipt repair={repairReceipt} onClose={() => setRepairReceipt(null)} />}
    </div>
  );
};

export default RepairsTab;