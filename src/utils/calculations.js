// src/utils/calculations.js

// --- ГЛОБАЛЬНЫЕ ФИНАНСОВЫЕ КОНСТАНТЫ ---
// Мы храним их здесь, чтобы при изменении налогов или договоренностей с L24
// достаточно было поменять цифру только в одном месте.
export const VAT_RATE = 0.24; // НДС 24% (Käibemaks)
export const L24_COMMISSION = 0.20; // Доля субподряда L24 (20%)

// Импортируем MASTERS — единый источник имён мастеров.
// Здесь сознательно идёт прямой импорт из constants.js, чтобы
// любые проверки «кто аутсорс» шли через ту же константу.
import { MASTERS } from './constants';

/**
 * ПОЛНЫЙ РАСЧЕТ ФИНАНСОВЫХ ПОКАЗАТЕЛЕЙ ЗАКАЗА (ИЗГОТОВЛЕНИЕ)
 * Эта функция берёт "сырой" заказ из базы и высчитывает все деньги:
 * сколько мы должны аутсорсу, сколько забирает L24, какой чистый доход мастерской.
 */
export const calcOrder = (o) => {
  const stages = o.stages || [];
  
  // 1. Считаем стоимость этапов работ
  // Сложность в том, что в ювелирной работе (Ювелирная работа) может быть массив rows с несколькими мастерами
  const getStageCost = st => st.rows 
    ? st.rows.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0)
    : parseFloat(st.cost) || 0;

  // 2. Считаем, сколько мы должны заплатить Аутсорсу за этапы
  const outsourceCost = stages.reduce((s, st) => {
    if (st.rows) {
      return s + st.rows.filter(r => r.employee === MASTERS.OUTSOURCE).reduce((ss, r) => ss + (parseFloat(r.cost) || 0), 0);
    }
    return s + (st.employee === MASTERS.OUTSOURCE ? (parseFloat(st.cost) || 0) : 0);
  }, 0);

  const stagesTotal = stages.reduce((s, st) => s + getStageCost(st), 0);
  const markup = parseFloat(o.markup) || 0; // Наценка
  // === «Стоимость изготовления» (productionCost) — то, что идёт в чек клиенту ===
  // Если поле заполнено — используем его. Иначе fallback для старых заказов: этапы + наценка.
  const productionCost = parseFloat(o.productionCost) || (stagesTotal + markup);
  const workTotal = productionCost; // Итог работы в чеке

  // 3. Считаем доп. позиции (Металл клиента, камни и т.д.)
  const extrasPrice = (o.extras || []).reduce((s, e) => s + (parseFloat(e.price) || 0), 0); // Сколько платит клиент
  const extrasCost = (o.extras || []).reduce((s, e) => s + (parseFloat(e.cost) || 0), 0);   // Какова наша себестоимость

  // 4. Специфичная логика Покрытия (Родий/Позолота)
  // Если покрытие делает Аутсорс, это плюсуется к расходам на Аутсорс.
  const coatingOutsource = (o.extras || [])
    .filter(e => e.type === "Покрытие" && e.coatingMaster === MASTERS.OUTSOURCE)
    .reduce((s, e) => s + (parseFloat(e.coatingCost) || 0), 0);
  
  const totalOutsourceCost = outsourceCost + coatingOutsource;

  // 5. Итоговые расчеты для Клиента
  const clientTotal = workTotal + extrasPrice; // Сумма клиенту без НДС
  const vat = o.vatEnabled ? clientTotal * VAT_RATE : 0; // Сумма НДС
  const clientTotalWithVat = clientTotal + vat; // Итого к оплате с НДС

  const prepayment = parseFloat(o.prepayment) || 0; // Внесенный аванс
  // === Остаток к доплате ===
  // Логика: если стоит `paymentDate` (дата полной оплаты) — финальный платёж прошёл, остаток = 0.
  // (Пользователь использует поле paymentDate как флаг «оплачено полностью».)
  const finalPaymentDate = o.paymentDate;
  const balance = finalPaymentDate ? 0 : (clientTotalWithVat - prepayment); // Остаток к доплате

  // 6. Специфичная логика работы с торговой точкой L24
  const isL24 = o.location === "L24";
  const l24Commission = isL24 ? clientTotal * L24_COMMISSION : 0; // Точка забирает 20%
  const l24OweUs = isL24 ? clientTotal * (1 - L24_COMMISSION) : 0; // L24 должна нам 80%
  const l24Prepayment = parseFloat(o.l24Prepayment) || 0; // Предоплата от L24
  const l24Remaining = isL24 ? Math.max(0, l24OweUs - l24Prepayment) : 0; // Сколько L24 еще должна доплатить нам

  // 7. ЧИСТАЯ ПРИБЫЛЬ МАСТЕРСКОЙ (Сумма клиента - Аутсорс - Себестоимость расходников - Комиссия L24)
  const projectIncome = clientTotal - totalOutsourceCost - extrasCost - l24Commission;

  return {
    stagesTotal,
    outsourceCost: totalOutsourceCost,
    markup,
    productionCost,     // ← итог работы (новое поле в форме)
    workTotal,
    extrasPrice,
    extrasCost,
    clientTotal,
    vat,
    clientTotalWithVat,
    prepayment,
    balance,
    projectIncome,
    l24Commission,
    isL24,
    coatingOutsource,
    l24OweUs,
    l24Prepayment,
    l24Remaining
  };
};

/**
 * ПОЛНЫЙ РАСЧЕТ ФИНАНСОВЫХ ПОКАЗАТЕЛЕЙ ЗАКАЗА CNC (Резка / 3D)
 * Считает долю Кирилла, долю мастерской и вычеты за купленные модели.
 */
export const calcCNC = (o) => {
  // Базовые стоимости этапов
  const modelCost = parseFloat(o.modelCost) || 0;
  const cuttingCost = parseFloat(o.cuttingCost) || 0;
  
  // Если мы покупали готовую 3D-модель на стороне (себестоимость)
  const purchasedModelCost = parseFloat(o.purchasedModelCost) || 0;
  
  // Итого клиенту
  const clientTotal = modelCost + cuttingCost;
  
  // Чистый доход = Сумма клиенту - затраты на покупку модели
  const netIncome = clientTotal - purchasedModelCost;
  
  // Учет L24
  const isL24 = o.location === "L24";
  const l24Commission = isL24 ? netIncome * L24_COMMISSION : 0;
  
  // Доход после выплаты комиссии L24
  const netAfterL24 = netIncome - l24Commission;
  
  // Делим доход 50/50 между мастерской и Кириллом
  const workshopShare = netAfterL24 / 2;
  const kirillShare = netAfterL24 / 2;

  return {
    modelCost, 
    cuttingCost, 
    purchasedModelCost, 
    clientTotal, 
    netIncome, 
    l24Commission, 
    netAfterL24, 
    workshopShare, 
    kirillShare, 
    isL24
  };
};