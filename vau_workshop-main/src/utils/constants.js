// src/utils/constants.js

// =============================================================
// МАСТЕРА — ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
// Используется ВЕЗДЕ: заказы, ремонты, CNC, статистика, формы.
// Любые другие списки мастеров (DEFAULT_WORKERS, STAGE_DEFS.employees и т.п.)
// строятся через этот объект, чтобы избежать дублей и опечаток.
// =============================================================
export const MASTERS = {
  KSENIYA:   "Kseniya",
  KIRILL:    "Kirill",
  OLEG:      "Oleg",
  ASTAROT:   "Astarot",
  SOFIA:     "Sofia",
  OUTSOURCE: "Outsource"
};

// Список-форма для .map() / .filter() — автогенерируется из объекта
export const MASTERS_LIST = Object.values(MASTERS);

// Базовый список для ведомости зарплат (без Аутсорса)
export const DEFAULT_WORKERS = [
  MASTERS.KSENIYA,
  MASTERS.KIRILL,
  MASTERS.OLEG,
  MASTERS.SOFIA,
  MASTERS.ASTAROT
];

export const STAGE_DEFS = [
  { type: "Модель / резка",    employees: [MASTERS.KIRILL, MASTERS.OUTSOURCE] },
  { type: "Литье",             employees: [MASTERS.KSENIYA, MASTERS.OUTSOURCE] },
  { type: "Ювелирная работа",  employees: [MASTERS.OLEG, MASTERS.KSENIYA, MASTERS.ASTAROT, MASTERS.OUTSOURCE] },
  { type: "Эмалирование",      employees: [MASTERS.KSENIYA] },
  { type: "Снятие резинки",    employees: [MASTERS.KSENIYA, MASTERS.OUTSOURCE] },
  { type: "Гравировка",        employees: [MASTERS.KIRILL, MASTERS.OUTSOURCE] },
];

export const MFG_TYPES_BILINGUAL = [
  ["Кольца обручальные (пара)", "Abielusõrmused (paar)"],
  ["Кольцо помолвочное",        "Kihlasõrmus"],
  ["Кольцо",                    "Sõrmus"],
  ["Перстень мужской",          "Meeste sõrmus"],
  ["Подвеска",                  "Ripats"],
  ["Крест",                     "Rist"],
  ["Цепь на шею",               "Kaelakett"],
  ["Цепь на руку",              "Käekett"],
  ["Цепь литая",                "Valukett"],
  ["Браслет",                   "Käevõru"],
  ["Серьги",                    "Kõrvarõngad"],
  ["Пирсинг",                   "Neet"],
  ["Брошь / Значок",            "Pross / Rinnamärk"],
  ["Запонки",                   "Mansetinööbid"],
  ["Зажим для галстука",        "Lipsu klamber"],
  ["Брелок",                    "Võtmehoidja"],
  ["Столовое серебро",          "Lauahõbe"],
  ["Сувенир",                   "Suveniir"]
];

export const L24_BILINGUAL = [
  ["Кольцо", "Sõrmused"],
  ["Цепь", "Ketid"],
  ["Серьги", "Kõrvarõngad"],
  ["Подвеска", "Ripatsid"],
  ["Браслет", "Käevõrud"],
  ["Пирсинг", "Neetid"],
  ["Брошь", "Prossid"],
  ["Печатка", "Pitsatsõrmused"]
];

export const REPAIR_CATEGORIES = [
  "Sõrmuse suuruse muutmine (ilma kivita)",
  "Sõrmuse suuruse muutmine (kiviga)",
  "Jootmine (kett)",
  "Jootmine (sõrmus)",
  "Jootmine (muu)",
  "Karabiini vahetus",
  "Luku parandus",
  "Luku valmistamine",
  "Osade remont",
  "Kõrva/silmuse vahetus või remont",
  "Ühenduslüli vahetus või remont",
  "Keti lühendamine",
  "Poleerimine / puhastamine",
  "Kõrvarõnga parandus",
  "Kõrvarõnga detailide vahetus",
  "Kõrvarõnga luku vahetus",
  "Kivi paigaldus",
  "Emaili restaureerimine",
  "Hõbelauanõude puhastamine",
  "Renoveerimine",
  "Katmine (ródium)",
  "Katmine (kullamine)",
  "Muu remont"
];

export const STONE_PRICES = {
  "Бриллиант": 20,
  "Сапфир": 15,
  "Рубин": 15,
  "Изумруд": 15,
  "Фианит": 5,
  "Полудраг": 10
};

// Начальный список постоянных расходов (провайдеров) для вкладки "Траты"
export const INITIAL_PROVIDERS = [
  { key: "rent", name: "Аренда помещения" },
  { key: "elec1", name: "Электричество Точка 1" },
  { key: "elec2", name: "Электричество Точка 2" },
  { key: "water", name: "Вода / Коммуналка" },
  { key: "subrent", name: "Доход от субаренды", sign: -1 }
];

// Список базовых услуг Кирилла на фрезере/3D принтере
export const CNC_SERVICES = ["3D Моделирование", "CNC Фрезеровка", "3D Печать (Полимер)", "Выращивание восковки"];

// Список мастеров мастерской по умолчанию для генерации пустой ведомости зарплат
// (DEFAULT_WORKERS определён выше — рядом с MASTERS)