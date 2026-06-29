// src/features/OrderForm.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { fmt, fmtDate, generateId, todayStr, generateOrderNumber, phonesMatch } from '../utils/helpers';
import { calcOrder } from '../utils/calculations';
import { STAGE_DEFS, MFG_TYPES_BILINGUAL, MASTERS_LIST, MASTERS } from '../utils/constants';
import { useAuth } from '../context/AuthContext';

import ClientSearch from '../components/ClientSearch';
import DateInput from '../components/DateInput';
import DraftBanner from '../components/DraftBanner';
import { useAutoSave } from '../hooks/useAutoSave';

const LOCATIONS = ["Vaugold", "Sikupilli", "L24"];
const PAY_METHODS = ["Sularaha VAUGOLD", "Sularaha EM", "Pank VAUGOLD", "Pank EM", "Kaart VAUGOLD", "Kaart EM"];
const EXTRA_TYPES = ["Аутсорс", "Металл", "Камни", "Фурнитура", "Покрытие", "Другое"];
const COATING_TYPES = ["Valge roodium", "Must roodium", "Ruteenium", "Kullatud", "Hõbetatud"];
const METAL_TYPES = ["Kuld", "Hõbe"];
const ORDER_STATUSES = ["Запрос", "В работе", "Изделие изготовлено", "Выдано"];

const emptyStages = () => STAGE_DEFS.map(d => ({
  type: d.type,
  employee: d.employees[0],
  cost: "",
  rows: d.type === "Ювелирная работа" ? [{ employee: d.employees[0], cost: "" }, { employee: "", cost: "" }] : null
}));

const emptyExtra = () => ({
  description: "",
  price: "",           // Итоговая стоимость клиенту
  cost: "",            // Итоговая себестоимость
  // === Поля для золота (Kuld) — кросс-формулы цена/грамм × вес = итого ===
  priceWeight: "",     // Вес (g) для расчёта цены клиенту
  pricePerGram: "",    // Цена за грамм (€/g) для клиента
  costWeight: "",      // Вес (g) для расчёта себестоимости
  costPerGram: "",     // Себестоимость за грамм (€/g)
  type: "",
  coatingMaster: "",
  coatingCost: ""
});

// Создание пустой заявки с автогенерацией номера
const createEmptyOrder = (orderNumber = "") => ({
  orderNumber: orderNumber,
  orderNumber2: "",          // № второго счёта (если оплата в 2 этапа по разным счетам)
  orderTitle: "", clientName: "", clientPhone: "", clientEmail: "",
  showClient2: false, client2Name: "", client2Phone: "",
  serviceType: MFG_TYPES_BILINGUAL[0][0], location: "Vaugold", source: "", isRepeat: "Новый",
  orderDate: todayStr(), deadline: "", workDoneDate: "", deliveryDate: "", status: "В работе",
  awaitingClient: false,           // Заказ ожидает клиента (авто-сбрасывается при указании deliveryDate)
  transportVauSiku: false,         // Ожидает курьера VAU → Sikupilli
  transportSikuVau: false,         // Ожидает курьера Sikupilli → VAU
  metalGiven: "", withStones: false, crossSell: false,
  stages: emptyStages(), markup: "",
  productionCost: "",              // Стоимость изготовления (итого в чек клиенту: работа + наценка + extras)
  extras: [emptyExtra()],
  prepayment: "", prepaymentDate: "", paymentMethod: "Sularaha VAUGOLD", finalPaymentMethod: "Sularaha VAUGOLD", vatEnabled: false,
  l24Prepayment: "", l24PrepaymentDate: "", l24PaymentStatus: "Не оплачено", paymentDate: "", l24PaymentMethod: "Перевод",
  masterTask: "", deadline3d: "", comment: "", images: [],
  // === Бухгалтерия ===
  reported: false,                // Заказ передан в бухгалтерию (отметка админа)
  reportedDate: "",               // Когда отмечен
  // === Итог проекта ===
  finalWeight: "",                // Финальный вес изделия (g)
  finalWeightWithLoss: "",        // Финальный вес с учётом потери металла (g)
  finalToAdd: "",                 // Сколько металла нужно добавить клиенту (g)
  finalToReturn: "",              // Сколько металла вернуть клиенту (g)
  assignedMaster: ""              // DEPRECATED: остался для совместимости со старыми заказами
});

/**
 * OrderForm — Компонент формы для создания нового заказа.
 * Не содержит журнала — только форму оформления.
 */
export const OrderForm = ({
  orders = [], saveOrder, updateOrder, editingOrder = null, onCancelEdit,
  customTypes = [], sources = [],
  allRepairs = [], allCnc = [],
  ensureOrderImages, // ИСПРАВЛЕНО 2026-06-27: ленивая загрузка фото
  onOpenViewer
}) => {
  // Получаем текущего пользователя для генерации номера заказа
  const { currentUser } = useAuth();

  // Функция для генерации нового номера заказа (объявляем ПЕРЕД использованием)
  const getNewOrderNumber = () => {
    const role = currentUser?.role || 'superuser';
    return generateOrderNumber(orders, role);
  };

  // Автосохранение в localStorage
  const { draft, save, lastSaved, showBanner, setShowBanner, clear: clearDraft } = useAutoSave('order', () => createEmptyOrder(getNewOrderNumber()));

  // При редактировании - не используем черновик
  const isEditing = !!editingOrder;

  // Инициализация формы: черновик или новая
  const initialForm = isEditing
    ? editingOrder
    : (draft || createEmptyOrder(getNewOrderNumber()));

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(editingOrder?.id || null);

  // Восстанавливаем черновик если загрузился
  useEffect(() => {
    if (draft && !isEditing) {
      setForm(draft);
    }
  }, [draft, isEditing]);

  // ИСПРАВЛЕНО 2026-06-27: при открытии заказа на редактирование — ленивая загрузка фото
  useEffect(() => {
    if (isEditing && editingOrder?.id && ensureOrderImages) {
      ensureOrderImages(editingOrder.id).then(imgs => {
        if (imgs && imgs.length > 0) {
          setForm(prev => ({...prev, images: imgs}));
        }
      });
    }
  }, [isEditing, editingOrder?.id, ensureOrderImages]);

  // === АВТО-ЗАПОЛНЕНИЕ для старых заказов ===
  // 1) productionCost пуст → заполняем = сумма этапов + наценка
  // 2) prepaymentDate пуст, а есть аванс → ставим = дате приёма заказа
  // 3) paymentDate пуст, а заказ выдан → ставим = дате выдачи
  useEffect(() => {
    if (!isEditing || !editingOrder) return;
    const updates = {};

    // 1) productionCost
    if (!editingOrder.productionCost || parseFloat(editingOrder.productionCost) <= 0) {
      const stagesTotal = (editingOrder.stages || []).reduce((s, st) => {
        if (st.rows) return s + st.rows.reduce((ss, r) => ss + (parseFloat(r.cost) || 0), 0);
        return s + (parseFloat(st.cost) || 0);
      }, 0);
      const markup = parseFloat(editingOrder.markup) || 0;
      const total = stagesTotal + markup;
      if (total > 0) {
        updates.productionCost = total.toFixed(2);
        console.log(`[Бэкфилл] Заказ ${editingOrder.id}: productionCost = ${updates.productionCost}`);
      }
    }

    // 2) prepaymentDate (дата аванса)
    if (!editingOrder.prepaymentDate && parseFloat(editingOrder.prepayment) > 0 && editingOrder.orderDate) {
      updates.prepaymentDate = editingOrder.orderDate;
      console.log(`[Бэкфилл] Заказ ${editingOrder.id}: prepaymentDate = ${updates.prepaymentDate}`);
    }

    // 3) paymentDate (дата полной оплаты)
    if (!editingOrder.paymentDate && editingOrder.deliveryDate) {
      updates.paymentDate = editingOrder.deliveryDate;
      console.log(`[Бэкфилл] Заказ ${editingOrder.id}: paymentDate = ${updates.paymentDate}`);
    }

    if (Object.keys(updates).length > 0) {
      setForm(p => ({ ...p, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder?.id]);

  // === Авто-сброс «Ожидает клиента» при указании даты выдачи ===
  useEffect(() => {
    if (form.deliveryDate && form.awaitingClient) {
      set("awaitingClient", false);
    }
  }, [form.deliveryDate]);

  // Автосохранение при изменении формы
  useEffect(() => {
    if (!isEditing && form) {
      const timer = setTimeout(() => save(form), 1500);
      return () => clearTimeout(timer);
    }
  }, [form, isEditing, save]);

  const calc = useMemo(() => calcOrder(form), [form]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const setStage = (i, k, v) => {
    const s = [...form.stages];
    s[i] = { ...s[i], [k]: v };
    set("stages", s);
  };

  const setExtraField = (i, k, v) => {
    const e = [...form.extras];
    e[i] = { ...e[i], [k]: v };
    set("extras", e);
  };

  // === Кросс-формулы для золота (Kuld) ===
  // При вводе любых двух из трёх (вес, цена за грамм, итого) — третье авто-считается.
  // Сделано отдельно для «цена клиенту» и «себестоимость».
  const setKuldField = (extraIdx, side, field, value) => {
    const extras = [...form.extras];
    const ex = { ...extras[extraIdx], [field]: value };

    const W  = side === "price" ? "priceWeight"   : "costWeight";
    const PG = side === "price" ? "pricePerGram"  : "costPerGram";
    const TOT = side === "price" ? "price" : "cost";

    const w  = parseFloat(ex[W])  || 0;
    const pg = parseFloat(ex[PG]) || 0;
    const t  = parseFloat(value)  || 0;

    if (field === W) {
      // ввели вес → если есть €/г, считаем итого
      if (pg > 0) ex[TOT] = (t * pg).toFixed(2);
    } else if (field === PG) {
      // ввели €/г → если есть вес, считаем итого
      if (w > 0) ex[TOT] = (w * t).toFixed(2);
    } else if (field === TOT) {
      // ввели итого → считаем то, чего не хватает
      if (w > 0) {
        // вес есть → считаем €/г
        ex[PG] = (t / w).toFixed(2);
      } else if (pg > 0) {
        // €/г есть, веса нет → считаем вес
        ex[W] = (t / pg).toFixed(2);
      }
      // если ни веса ни €/г нет — просто сохраняем итого как есть
    }

    extras[extraIdx] = ex;
    set("extras", extras);
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => setForm(p => ({ ...p, images: [...(p.images || []), ev.target.result] }));
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const handleSave = (e, isDraft = false) => {
    if (e) e.preventDefault();
    if (!form.source || !form.serviceType) {
      alert("Укажите источник и тип изделия.");
      return;
    }

    const dataToSave = { ...form, ...calc, isDraft, category: "Изготовление" };

    if (editingId) {
      updateOrder({ ...dataToSave, id: editingId });
      setEditingId(null);
      setForm(createEmptyOrder(getNewOrderNumber()));
      handleClearEditing(); // Очищаем editingOrder после успешного обновления
    } else {
      saveOrder({ ...dataToSave, id: generateId() });
      // Очищаем черновик после успешного сохранения нового заказа
      clearDraft();
      setForm(createEmptyOrder(getNewOrderNumber()));
      handleClearEditing(); // Очищаем editingOrder после успешного сохранения
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancel = () => {
    setForm(createEmptyOrder(getNewOrderNumber()));
    setEditingId(null);
    if (onCancelEdit) onCancelEdit();
  };

  // Callback для очистки editingOrder после успешного сохранения
  const handleClearEditing = () => {
    if (onCancelEdit) onCancelEdit();
  };

  return (
    <>
      <DraftBanner
        show={showBanner}
        lastSaved={lastSaved}
        onDismiss={() => {
          setShowBanner(false);
          clearDraft(); // Очищаем при закрытии
        }}
        onClear={() => {
          clearDraft();
          setForm(createEmptyOrder(getNewOrderNumber()));
        }}
      />

      <div className="bg-white p-6 md:p-8 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 relative">

      {editingId && (
        <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 rounded-t-[24px] px-6 py-3 flex justify-between items-center text-amber-700 font-semibold text-sm">
          <span>✏️ Редактирование заказа № {form.orderNumber || "—"}</span>
          <button onClick={handleCancel} className="bg-white border border-amber-300 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">Отмена</button>
        </div>
      )}

      <div className={`flex justify-between items-center mb-6 ${editingId ? 'mt-8' : ''}`}>
        <h2 className="text-lg font-bold text-slate-800 tracking-tight">
          {editingId ? "Детали заказа" : "🔨 Оформление нового заказа"}
        </h2>
      </div>

      <form onSubmit={e => handleSave(e, false)} className="space-y-8">

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 1: ОСНОВНАЯ ИНФОРМАЦИЯ                                     ║
         * ║  - № заказа: уникальный идентификатор (ручной ввод)              ║
         * ║  - Название проекта: описание/название изделия                    ║
         * ║  - Тип изделия: кольца, цепи, серьги и т.д. (из констант + кастом)║
         * ║  - Источник: откуда пришёл клиент (Meta, TikTok, рекомендация...)  ║
         * ║  - Точка: Vaugold / Sikupilli / L24 (точка приёма заказа)         ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">№ заказа</label>
            <input type="text" placeholder="2026-041" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.orderNumber} onChange={e => set("orderNumber", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">№ 2-го счёта <span className="text-slate-400 font-normal normal-case">(если оплата в 2 этапа)</span></label>
            <input type="text" placeholder="2026-041/2" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.orderNumber2} onChange={e => set("orderNumber2", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Стоимость изготовления <span className="text-emerald-600 font-normal normal-case">(итого в чек клиенту)</span></label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="w-full px-4 py-2 bg-emerald-50/50 border-2 border-emerald-200 rounded-xl text-base font-bold text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500" value={form.productionCost || ""} onChange={e => set("productionCost", e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Название проекта</label>
            <input type="text" placeholder="Напр: Обручальные Анна+Марк" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.orderTitle} onChange={e => set("orderTitle", e.target.value)} />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Тип изделия</label>
            <select className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.serviceType} onChange={e => set("serviceType", e.target.value)}>
              <option value="">— выбрать —</option>
              {MFG_TYPES_BILINGUAL.map(t => <option key={t[0]} value={t[0]}>{t[0]}</option>)}
              {customTypes.map(t => <option key={t.ru} value={t.ru}>{t.ru}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Источник</label>
            <select className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.source} onChange={e => set("source", e.target.value)}>
              <option value="">— выбрать —</option>
              {sources.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Пункт приёма</label>
            <select className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.location} onChange={e => set("location", e.target.value)}>
              {LOCATIONS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 2: КЛИЕНТ                                                   ║
         * ║  - Умный поиск клиента: автозаполнение по имени/телефону         ║
         * ║  - Индикатор повторного клиента: подсветка если телефон уже есть  ║
         * ║  - Cross-Sell чекбокс: пометка для аналитики                     ║
         * ║  - Второй клиент: поддержка пар (две персоны на один заказ)       ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="p-5 border border-slate-200 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Данные клиента</h3>

          {form.clientPhone && [...orders, ...allRepairs, ...allCnc].filter(o => o.id !== editingId && phonesMatch(o.clientPhone, form.clientPhone)).length > 0 && (
            <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-2 rounded-lg border border-emerald-200 inline-block">
              ↩ Повторный клиент
            </div>
          )}

          <ClientSearch
            clientName={form.clientName}
            clientPhone={form.clientPhone}
            clientEmail={form.clientEmail}
            allHistory={[...orders, ...allRepairs, ...allCnc]}
            onSelect={data => {
              const isRpt = data.clientPhone ? [...orders, ...allRepairs, ...allCnc].some(o => phonesMatch(o.clientPhone, data.clientPhone) && o.id !== editingId) : false;
              setForm(p => ({ ...p, ...data, isRepeat: isRpt ? "Повторный" : "Новый" }));
            }}
          />

          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.crossSell} onChange={e => set("crossSell", e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
              <span className="font-semibold">Cross-Sell</span>
            </label>

            {!form.showClient2 && (
              <button type="button" onClick={() => set("showClient2", true)} className="text-xs border border-dashed border-slate-300 text-slate-500 px-3 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                + Добавить второго клиента
              </button>
            )}
          </div>

          {form.showClient2 && (
            <div className="pt-4 border-t border-slate-100 relative bg-slate-50 p-4 rounded-xl mt-4">
              <button type="button" onClick={() => { set("showClient2", false); set("client2Name", ""); set("client2Phone", ""); }} className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 font-bold">&times;</button>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Второй клиент</h4>
              <ClientSearch
                clientName={form.client2Name}
                clientPhone={form.client2Phone}
                clientEmail={""}
                allHistory={[...orders, ...allRepairs, ...allCnc]}
                onSelect={data => {
                  setForm(p => ({ ...p, client2Name: data.clientName, client2Phone: data.clientPhone }));
                }}
              />
            </div>
          )}
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 3: ДАТЫ И СТАТУС                                         ║
         * ║  - Принят: дата поступления заказа (дефолт: сегодня)              ║
         * ║  - Дедлайн: срок выполнения (подсвечивается красным если просрочен)║
         * ║  - Готов: дата готовности изделия                                  ║
         * ║  - Выдан: дата выдачи клиенту                                     ║
         * ║  - Статус: Запрос / В работе / Изделие изготовлено / Выдано        ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Принят</label><DateInput value={form.orderDate} onChange={e => set("orderDate", e.target.value)} /></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дедлайн</label><DateInput value={form.deadline} onChange={e => set("deadline", e.target.value)} className={form.deadline && new Date(form.deadline) < new Date() && form.status !== "Выдано" ? "!bg-rose-50 !border-rose-300 !text-rose-700 font-bold" : ""} /></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Готов</label><DateInput value={form.workDoneDate} onChange={e => set("workDoneDate", e.target.value)} /></div>
          <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Выдан</label><DateInput value={form.deliveryDate} onChange={e => set("deliveryDate", e.target.value)} /></div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Статус</label>
            <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2" value={form.status} onChange={e => set("status", e.target.value)}>
              {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* === ТРАНСПОРТИРОВКА + ОЖИДАНИЕ КЛИЕНТА === */}
        <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Транспортировка (курьер)</div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg hover:bg-orange-100 transition-colors">
              <input type="checkbox" checked={!!form.transportVauSiku} onChange={e => set("transportVauSiku", e.target.checked)} className="w-4 h-4 rounded text-orange-600 cursor-pointer" />
              <span className="font-semibold">🛵 VAU → Sikupilli</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg hover:bg-teal-100 transition-colors">
              <input type="checkbox" checked={!!form.transportSikuVau} onChange={e => set("transportSikuVau", e.target.checked)} className="w-4 h-4 rounded text-teal-600 cursor-pointer" />
              <span className="font-semibold">🛵 Sikupilli → VAU</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-violet-50 border border-violet-200 px-3 py-2 rounded-lg hover:bg-violet-100 transition-colors">
              <input type="checkbox" checked={!!form.awaitingClient} onChange={e => set("awaitingClient", e.target.checked)} className="w-4 h-4 rounded text-violet-600 cursor-pointer" disabled={!!form.deliveryDate} />
              <span className={`font-semibold ${form.deliveryDate ? "text-slate-400 line-through" : ""}`}>⏳ Ожидает клиента{form.deliveryDate && " (выдан)"}</span>
            </label>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК L24: РАСЧЁТЫ С СУБПОДРЯДЧИКОМ (только для точки L24)    ║
         * ║  - Аванс от L24: предоплата субподрядчика                       ║
         * ║  - Дата аванса: когда получена предоплата                        ║
         * ║  - Способ оплаты: наличные / карта / по банку                   ║
         * ║  - Финансовый статус: оплачено / не оплачено                      ║
         * ║  - Дата полной оплаты: когда L24 полностью рассчитался           ║
         * ║  - Автоматический расчёт комиссии 20% и остатка долга             ║
         * ║  - Примечание: L24 берёт 20% от суммы заказа как комиссию        ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        {form.location === "L24" && (
          <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-4">
            <div className="text-[10px] font-black text-amber-700 uppercase tracking-widest">⚠ L24 — Расчеты с субподрядчиком (20% комиссия)</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className="text-xs font-bold text-amber-900 block mb-1">Аванс от L24 (€)</label><input type="number" className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white" value={form.l24Prepayment} onChange={e => set("l24Prepayment", e.target.value)} /></div>
              <div><label className="text-xs font-bold text-amber-900 block mb-1">Дата аванса</label><DateInput value={form.l24PrepaymentDate} onChange={e => set("l24PrepaymentDate", e.target.value)} className="!border-amber-300" /></div>
              <div>
                <label className="text-xs font-bold text-amber-900 block mb-1">Способ</label>
                <select className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white" value={form.l24PaymentMethod} onChange={e => set("l24PaymentMethod", e.target.value)}>
                  {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-amber-200/50 pt-4">
              <div>
                <label className="text-xs font-bold text-amber-900 block mb-1">Фин. Статус L24</label>
                <select className={`w-full px-3 py-2 rounded-lg border font-bold ${form.paymentStatus === 'Оплачено' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-rose-100 border-rose-300 text-rose-800'}`} value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}>
                  <option>Не оплачено</option><option>Оплачено</option>
                </select>
              </div>
              <div><label className="text-xs font-bold text-amber-900 block mb-1">Дата полной оплаты</label><DateInput value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} className="!border-amber-300" /></div>
            </div>

            {form.paymentStatus !== "Оплачено" && calc.l24Remaining > 0 && (
              <div className="bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold px-4 py-2 rounded-lg flex justify-between items-center">
                <span>Остаток долга L24 нам:</span>
                <span className="text-base">{fmt(calc.l24Remaining)}</span>
              </div>
            )}
          </div>
        )}

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 4: ЭТАПЫ РАБОТ (для расчёта зарплаты мастеров)          ║
         * ║  Этапы: Модель/резка → Литьё → Ювелирная работа → Эмалирование  ║
         * ║         → Снятие резинки → Гравировка                              ║
         * ║  - Для каждого этапа: выбор мастера + сумма оплаты               ║
         * ║  - "Ювелирная работа" поддерживает двух мастеров                    ║
         * ║    (основной + помощник для раздельного расчёта ЗП)               ║
         * ║  - Наша доля (для L24): автоматически ×0.8                         ║
         * ║  - Скрытая наценка: дополнительная наценка к стоимости            ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Этапы работ (Для расчета ЗП и Аутсорса)</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 font-medium border-b border-slate-200">
                <tr><th className="p-3">Этап</th><th className="p-3">Мастер</th><th className="p-3 text-right">Оплата (€)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {form.stages.map((s, i) => {
                  const def = STAGE_DEFS[i];

                  if (s.rows) {
                    return s.rows.map((row, ri) => (
                      <tr key={`${i}-${ri}`} className={ri === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="p-2 pl-4 text-xs">
                          {ri === 0 ? <span className="font-bold text-blue-600">{def.type}</span> : <span className="text-slate-400 pl-4">↳ Мастер {ri + 1}</span>}
                        </td>
                        <td className="p-2">
                          <select className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none text-xs" value={row.employee} onChange={e => {
                            const nr = [...s.rows]; nr[ri].employee = e.target.value; setStage(i, "rows", nr);
                          }}>
                            <option value="">—</option>
                            {def.employees.map(em => <option key={em}>{em}</option>)}
                          </select>
                        </td>
                        <td className="p-2 text-right">
                          <input type="number" min="0" className="w-20 sm:w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-right outline-none text-xs font-semibold" value={row.cost} onChange={e => {
                            const nr = [...s.rows]; nr[ri].cost = e.target.value; setStage(i, "rows", nr);
                          }} />
                          {form.location === "L24" && parseFloat(row.cost) > 0 && <div className="text-[9px] text-amber-600 mt-1 font-medium">наша доля: {fmt(parseFloat(row.cost) * 0.8)}</div>}
                        </td>
                      </tr>
                    ));
                  }

                  return (
                    <tr key={i} className="bg-white">
                      <td className="p-2 pl-4 text-xs font-semibold text-slate-700">{def.type}</td>
                      <td className="p-2">
                        <select className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none text-xs" value={s.employee} onChange={e => setStage(i, "employee", e.target.value)}>
                          <option value="">—</option>
                          {def.employees.map(em => <option key={em}>{em}</option>)}
                        </select>
                      </td>
                      <td className="p-2 text-right">
                        <input type="number" min="0" className="w-20 sm:w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-right outline-none text-xs font-semibold" value={s.cost} onChange={e => setStage(i, "cost", e.target.value)} />
                        {form.location === "L24" && parseFloat(s.cost) > 0 && <div className="text-[9px] text-amber-600 mt-1 font-medium">наша доля: {fmt(parseFloat(s.cost) * 0.8)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end items-center gap-3 mt-4">
            <span className="text-xs text-slate-500 font-medium">Скрытая наценка (€):</span>
            <input type="number" min="0" className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-right outline-none text-sm font-bold text-emerald-600" value={form.markup} onChange={e => set("markup", e.target.value)} placeholder="0" />
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 5: МАТЕРИАЛЫ И ПОКРЫТИЯ                                 ║
         * ║  - Типы: Аутсорс, Металл, Камни, Фурнитура, Покрытие, Другое   ║
         * ║  - Для металла: выбор Kuld (золото) / Hõbe (серебро)            ║
         * ║  - Для покрытия: эстонские типы (Roodium, Kullatud и т.д.)      ║
         * ║  - Себестоимость: закупочная цена (розовая)                      ║
         * ║  - Цена клиенту: продажная цена (зелёная)                        ║
         * ║  - Специальное: для покрытия — мастер + ЗП мастера               ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Материалы и Покрытия</h3>
            <button type="button" onClick={() => set("extras", [...form.extras, emptyExtra()])} className="text-xs bg-white border border-slate-300 text-slate-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">+ Добавить</button>
          </div>

          <div className="space-y-4">
            {form.extras.map((ex, i) => {
              const isMetal = ex.type === "Металл";
              const isCoating = ex.type === "Покрытие";
              const isKuld = isMetal && ex.description === "Kuld";

              return (
                <div key={i} className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 relative">
                  <button type="button" onClick={() => set("extras", form.extras.filter((_, j) => j !== i))} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-100 text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors">&times;</button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-8">
                    <div>
                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Тип</label>
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={ex.type} onChange={e => setExtraField(i, "type", e.target.value)}>
                        <option value="">—</option>
                        {EXTRA_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Описание</label>
                      {isCoating ? (
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={ex.description} onChange={e => setExtraField(i, "description", e.target.value)}>
                          <option value="">—</option>{COATING_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      ) : isMetal ? (
                        <select className={`w-full bg-slate-50 border rounded-lg px-2 py-1.5 text-xs outline-none ${isKuld ? "border-amber-400 ring-1 ring-amber-200" : "border-slate-200"}`} value={ex.description} onChange={e => setExtraField(i, "description", e.target.value)}>
                          <option value="">—</option>{METAL_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      ) : (
                        <input type="text" placeholder="Уточнение..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={ex.description} onChange={e => setExtraField(i, "description", e.target.value)} />
                      )}
                    </div>
                  </div>

                  {isKuld ? (
                    /* === РЕЖИМ ЗОЛОТО: кросс-формулы вес × цена/грамм = итого === */
                    <div className="mt-3 border-t border-amber-200 pt-3">
                      <div className="text-[9px] font-bold text-amber-700 uppercase mb-2">✨ Золото (Kuld) — кросс-формулы: вес × €/г = итого</div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* === Себестоимость (для нас) === */}
                        <div className="bg-rose-50/60 border border-rose-200 rounded-lg p-3">
                          <div className="text-[9px] font-bold text-rose-600 uppercase mb-2">Себестоимость (наша закупка)</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[8px] text-rose-400 uppercase block mb-0.5">Вес (g)</label>
                              <input type="number" step="0.01" className="w-full bg-white border border-rose-200 rounded px-2 py-1.5 text-xs outline-none" value={ex.costWeight || ""} onChange={e => setKuldField(i, "cost", "costWeight", e.target.value)} placeholder="0" />
                            </div>
                            <div>
                              <label className="text-[8px] text-rose-400 uppercase block mb-0.5">€/г (закупка)</label>
                              <input type="number" step="0.01" className="w-full bg-white border border-rose-200 rounded px-2 py-1.5 text-xs outline-none" value={ex.costPerGram || ""} onChange={e => setKuldField(i, "cost", "costPerGram", e.target.value)} placeholder="0" />
                            </div>
                            <div>
                              <label className="text-[8px] text-rose-700 uppercase block mb-0.5 font-black">Итого себ.</label>
                              <input type="number" step="0.01" className="w-full bg-rose-100 border-2 border-rose-300 rounded px-2 py-1.5 text-xs font-bold text-rose-800 outline-none" value={ex.cost || ""} onChange={e => setExtraField(i, "cost", e.target.value)} placeholder="0.00" />
                            </div>
                          </div>
                        </div>

                        {/* === Цена клиенту === */}
                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3">
                          <div className="text-[9px] font-bold text-emerald-600 uppercase mb-2">Цена клиенту (продажа)</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[8px] text-emerald-400 uppercase block mb-0.5">Вес (g)</label>
                              <input type="number" step="0.01" className="w-full bg-white border border-emerald-200 rounded px-2 py-1.5 text-xs outline-none" value={ex.priceWeight || ""} onChange={e => setKuldField(i, "price", "priceWeight", e.target.value)} placeholder="0" />
                            </div>
                            <div>
                              <label className="text-[8px] text-emerald-400 uppercase block mb-0.5">€/г (клиенту)</label>
                              <input type="number" step="0.01" className="w-full bg-white border border-emerald-200 rounded px-2 py-1.5 text-xs outline-none" value={ex.pricePerGram || ""} onChange={e => setKuldField(i, "price", "pricePerGram", e.target.value)} placeholder="0" />
                            </div>
                            <div>
                              <label className="text-[8px] text-emerald-700 uppercase block mb-0.5 font-black">Итого прод.</label>
                              <input type="number" step="0.01" className="w-full bg-emerald-100 border-2 border-emerald-300 rounded px-2 py-1.5 text-xs font-bold text-emerald-800 outline-none" value={ex.price || ""} onChange={e => setExtraField(i, "price", e.target.value)} placeholder="0.00" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* === ОБЫЧНЫЙ РЕЖИМ (без золота) === */
                    <div className="grid grid-cols-2 gap-4 mt-3 border-t border-slate-100 pt-3">
                      <div>
                        <label className="text-[9px] font-bold text-rose-400 uppercase block mb-1">Себестоимость (€)</label>
                        <input type="number" className="w-full bg-rose-50/50 border border-rose-100 rounded-lg px-2 py-1.5 text-xs outline-none font-semibold text-rose-700" value={ex.cost} onChange={e => setExtraField(i, "cost", e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-emerald-500 uppercase block mb-1">Цена клиенту (€)</label>
                        <input type="number" className="w-full bg-emerald-50/50 border border-emerald-100 rounded-lg px-2 py-1.5 text-xs outline-none font-semibold text-emerald-700" value={ex.price} onChange={e => setExtraField(i, "price", e.target.value)} placeholder="0.00" />
                      </div>
                    </div>
                  )}

                  {isCoating && (
                    <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-bold text-indigo-400 uppercase block mb-1">Мастер покрытия</label>
                        <select className="w-full bg-white border border-indigo-200 rounded-lg px-2 py-1.5 text-xs outline-none" value={ex.coatingMaster} onChange={e => setExtraField(i, "coatingMaster", e.target.value)}>
                          <option value="">—</option>
                          {[MASTERS.KSENIYA, MASTERS.OLEG, MASTERS.OUTSOURCE].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-indigo-400 uppercase block mb-1">ЗП Мастера / Аутсорс (€)</label>
                        <input type="number" className="w-full bg-white border border-indigo-200 rounded-lg px-2 py-1.5 text-xs font-semibold outline-none" value={ex.coatingCost} onChange={e => setExtraField(i, "coatingCost", e.target.value)} placeholder="0.00" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 6: ОПЛАТА ОТ КЛИЕНТА                                    ║
         * ║  - Аванс: предоплата клиента при принятии заказа               ║
         * ║  - Способ аванса: наличные / карта / по банку                  ║
         * ║  - Способ доплаты: как клиент будет доплачивать остаток         ║
         * ║  - Чекбокс НДС 24%: для официального оформления (Эстония)     ║
         * ║  - Автоматический расчёт остатка к доплате                       ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-6">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Аванс от клиента (€)</label>
            <input type="number" min="0" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2" value={form.prepayment} onChange={e => set("prepayment", e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дата аванса</label>
            <DateInput value={form.prepaymentDate} onChange={e => set("prepaymentDate", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Способ аванса</label>
            <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={form.paymentMethod} onChange={e => set("paymentMethod", e.target.value)}>
              {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Дата полной оплаты</label>
            <DateInput value={form.paymentDate} onChange={e => set("paymentDate", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Способ доплаты</label>
            <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" value={form.finalPaymentMethod} onChange={e => set("finalPaymentMethod", e.target.value)}>
              {PAY_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3 flex items-center mt-2">
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-blue-50 border border-blue-100 rounded-lg">
              <input type="checkbox" checked={form.vatEnabled} onChange={e => set("vatEnabled", e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-xs font-bold text-blue-900">НДС 24% (Официально)</span>
            </label>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК 7: ФОТО И ТЕХНИЧЕСКОЕ ЗАДАНИЕ                          ║
         * ║  - ТЗ мастеру: текстовое поле для особых указаний по работе  ║
         * ║  - Фото: загрузка эскизов/референсов (Base64 в localStorage)  ║
         * ║  - Поддержка Drag & Drop и вставки из буфера обмена (Ctrl+V)   ║
         * ║  - Просмотр в лайтбоксе при клике на фото                     ║
         * ║  - Удаление фото: крестик появляется при наведении             ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Техническое задание мастеру</label>
            <textarea rows={4} placeholder="Особенности изготовления..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none" value={form.masterTask} onChange={e => set("masterTask", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block flex justify-between">
              <span>Фотографии и эскизы</span>
              <span className="text-slate-300 font-normal normal-case">Можно вставить Ctrl+V</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {form.images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt="Эскиз" className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-sm cursor-zoom-in" onClick={() => onOpenViewer(form.images, i)} />
                  <button type="button" onClick={() => set("images", form.images.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md">&times;</button>
                </div>
              ))}
              <label className="w-20 h-20 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition-colors rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 cursor-pointer">
                <span className="text-2xl leading-none mb-1">+</span>
                <span className="text-[10px] font-semibold">ФОТО</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК: ДОПОЛНИТЕЛЬНЫЕ КОММЕНТАРИИ                                 ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="pt-4 border-t border-slate-100">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Дополнительные комментарии</label>
          <textarea rows={3} placeholder="Любые важные примечания к заказу: источник клиента, особенности доставки, договорённости по срокам, что-то нестандартное..." className="w-full px-4 py-3 bg-amber-50/40 border border-amber-200 rounded-xl text-sm outline-none resize-none italic" value={form.comment || ""} onChange={e => set("comment", e.target.value)} />
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  БЛОК: ИТОГ ПРОЕКТА (металл и финальные веса)                    ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 p-5 rounded-2xl border border-slate-200">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">⚖️ Итог проекта (металл и финальные веса)</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Металл от клиента (g)</label>
              <input type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.metalGiven || ""} onChange={e => set("metalGiven", e.target.value)} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Финальный вес изделия (g)</label>
              <input type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.finalWeight || ""} onChange={e => set("finalWeight", e.target.value)} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Финальный вес с потерей (g)</label>
              <input type="number" step="0.01" placeholder="0.00" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" value={form.finalWeightWithLoss || ""} onChange={e => set("finalWeightWithLoss", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2 md:col-span-1">
              <div>
                <label className="text-[9px] font-bold text-emerald-600 uppercase block mb-1">Добавить клиенту (g)</label>
                <input type="number" step="0.01" placeholder="0" className="w-full px-2 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold text-emerald-700" value={form.finalToAdd || ""} onChange={e => set("finalToAdd", e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-bold text-rose-600 uppercase block mb-1">Вернуть клиенту (g)</label>
                <input type="number" step="0.01" placeholder="0" className="w-full px-2 py-2 bg-rose-50 border border-rose-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-500 font-semibold text-rose-700" value={form.finalToReturn || ""} onChange={e => set("finalToReturn", e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  ИТОГОВЫЙ РАСЧЁТ: Резюме для клиента + Доход мастерской         ║
         * ║                                                                    ║
         * ║  ЛЕВАЯ КОЛОНКА — "Резюме для клиента":                           ║
         * ║  - Стоимость работ: сумма всех этапов                             ║
         * ║  - Доп. позиции: стоимость материалов/покрытий                    ║
         * ║  - НДС 24%: если включён чекбокс "Официально"                     ║
         * ║  - Итого клиенту: финальная сумма (с НДС)                         ║
         * ║  - Остаток к доплате: если есть неоплаченная часть                ║
         * ║                                                                    ║
         * ║  ПРАВАЯ КОЛОНКА — "Доход мастерской (Нетто)":                     ║
         * ║  - Сумма без НДС: для внутреннего учёта                           ║
         * ║  - Аутсорс: расходы на внешних исполнителей                        ║
         * ║  - Себест. материалов: закупочная стоимость                       ║
         * ║  - Комиссия L24 (20%): вычитается для заказов L24                ║
         * ║  - Чистая прибыль: реальный доход мастерской                       ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="bg-slate-900 text-white p-6 rounded-[24px] shadow-xl grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Резюме для клиента</h4>
            <div className="flex justify-between text-sm"><span>Стоимость изготовления:</span><span className="font-semibold">{fmt(calc.workTotal)}</span></div>
            <div className="flex justify-between text-sm"><span>Доп. позиции:</span><span className="font-semibold">{fmt(calc.extrasPrice)}</span></div>
            {form.vatEnabled && <div className="flex justify-between text-sm text-blue-400"><span>НДС 24%:</span><span className="font-semibold">+{fmt(calc.vat)}</span></div>}
            <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Итого клиенту</span>
              <span className="text-2xl font-serif text-emerald-400">{fmt(calc.clientTotalWithVat)}</span>
            </div>
            {form.paymentDate ? (
              <div className="flex justify-between text-xs text-emerald-300 font-bold mt-1"><span>✓ Оплачено</span><span>{fmtDate(form.paymentDate)}</span></div>
            ) : calc.balance > 0 ? (
              <div className="flex justify-between text-xs text-rose-300 font-bold mt-1"><span>Остаток к доплате:</span><span>{fmt(calc.balance)}</span></div>
            ) : null}
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Доход мастерской (Нетто)</h4>
            <div className="flex justify-between text-sm"><span>Сумма без НДС:</span><span className="font-semibold">{fmt(calc.clientTotal)}</span></div>
            {calc.outsourceCost > 0 && <div className="flex justify-between text-xs text-rose-400"><span>Аутсорс:</span><span>-{fmt(calc.outsourceCost)}</span></div>}
            {calc.extrasCost > 0 && <div className="flex justify-between text-xs text-rose-400"><span>Себест. материалов:</span><span>-{fmt(calc.extrasCost)}</span></div>}
            {calc.isL24 && <div className="flex justify-between text-xs text-amber-400 font-bold"><span>Комиссия L24 (20%):</span><span>-{fmt(calc.l24Commission)}</span></div>}
            <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Чистая прибыль</span>
              <span className="text-xl font-black text-white">{fmt(calc.projectIncome)}</span>
            </div>
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════════════════════════╗
         * ║  КНОПКИ УПРАВЛЕНИЯ                                              ║
         * ║  - Сохранить как черновик: сохраняет без валидации источника    ║
         * ║  - Создать заказ: полная ваалидация + сохранение в базу        ║
         * ║  - При редактировании: кнопка меняется на "Сохранить изменения" ║
         * ╚══════════════════════════════════════════════════════════════════╝ */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
          <button type="button" onClick={e => handleSave(e, true)} className="flex-1 border-2 border-dashed border-slate-300 text-slate-500 font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-colors">
            📝 Сохранить как черновик
          </button>
          <button type="submit" className="flex-1 bg-blue-600 text-white font-bold text-sm tracking-wide uppercase px-6 py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
            {editingId ? "💾 Сохранить изменения" : "✨ Создать заказ"}
          </button>
        </div>
      </form>
      </div>
    </>
  );
};

export default OrderForm;