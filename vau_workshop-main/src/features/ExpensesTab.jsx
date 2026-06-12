// src/features/ExpensesTab.jsx
import React, { useState, useMemo } from 'react';
import { fmt, mLabel } from '../utils/helpers';
import { DEFAULT_WORKERS } from '../utils/constants';

/**
 * Модуль операционного учета расходов, фиксированных провайдеров и зарплатных ведомостей.
 * Поддерживает отрицательные знаки для доходных статей (например, субаренда), высчитывает сумму 
 * коммуналки и генерирует списки нетто-выплат мастерам.
 */
export const ExpensesTab = ({ expenses = {}, setExpenses, providers = [], setProviders }) => {
  const now = new Date();
  
  // Выставляем стейт текущего выбранного месяца по умолчанию (формат: "YYYY-MM")
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  
  // Стейты для редактирования названий постоянных расходов (например, сменился провайдер интернета)
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");

  // Стейт для добавления новой статьи расходов
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");

  // Достаем расходы под конкретный выбранный период (месяц). Если данных нет — пустой объект.
  const data = expenses[month] || {};

  // Функция-мутатор для безопасного сохранения данных в глобальный объект expenses
  const setData = (newData) => setExpenses({ ...expenses, [month]: newData });
  
  // Обновление конкретной статьи расходов
  const setVal = (key, val) => setData({ ...data, [key]: val });

  // Внеплановые закупки (расходники, кофе и т.д.)
  const extras = data.extras || [];
  
  // Автоматический рендер базовых мастеров, если ведомость по этому месяцу еще пуста.
  // Это экономит время: не нужно каждый месяц заново вбивать имена сотрудников.
  const salaries = data.salaries && data.salaries.length > 0
    ? data.salaries
    : DEFAULT_WORKERS.map(name => ({ name, amount: "" }));

  // --- ДИНАМИЧЕСКИЕ ХЕЛПЕРЫ ДЛЯ ВЛОЖЕННЫХ МАССИВОВ ---
  
  // Обновление внеплановой закупки
  const setExtra = (i, k, v) => { 
    const e = [...extras]; 
    e[i] = { ...e[i], [k]: v }; 
    setData({ ...data, extras: e }); 
  };
  
  // Обновление зарплаты мастера
  const setSalary = (i, k, v) => { 
    const s = [...salaries]; 
    s[i] = { ...s[i], [k]: v }; 
    setData({ ...data, salaries: s }); 
  };
  
  // Добавление новой строки в ведомость
  const addSalary = () => setData({ ...data, salaries: [...salaries, { name: "", amount: "" }] });
  
  // Удаление строки из ведомости
  const removeSalary = (i) => setData({ ...data, salaries: salaries.filter((_, j) => j !== i) });

  // Добавление новой статьи расходов (провайдера)
  const addProvider = () => {
    if (!newProviderName.trim()) return;
    const key = `custom_${Date.now()}`;
    setProviders([...providers, { key, name: newProviderName.trim(), sign: 1 }]);
    setNewProviderName("");
    setAddingProvider(false);
  };

  // Удаление статьи расходов (провайдера)
  const removeProvider = (key) => {
    if (window.confirm(`Удалить статью "${providers.find(p => p.key === key)?.name}"?`)) {
      setProviders(providers.filter(p => p.key !== key));
    }
  };

  // --- МАТЕМАТИЧЕСКОЕ ЯДРО (Точный возврат из монолита) ---
  
  // Отдельно выводим коммуналку для удобства (электричество 1, электричество 2, вода)
  const utilKeys = ["elec1", "elec2", "water"];
  const utilTotal = utilKeys.reduce((s, k) => s + (parseFloat(data[k]) || 0), 0);
  
  // Доход от субаренды. В базе он хранится в общих провайдерах, но логически это вычет из расходов (sign: -1)
  const subrentAmount = parseFloat(data["subrent"]) || 0; 

  // Суммируем основные фиксированные платежи (аренда, интернет, охрана), ИСКЛЮЧАЯ налоги и субаренду
  const mainExpenses = providers
    .filter(p => p.key !== "taxes" && p.key !== "subrent")
    .reduce((s, p) => s + (parseFloat(data[p.key]) || 0), 0);
    
  // Суммируем допы и ЗП
  const extrasTotal = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const salariesTotal = salaries.reduce((s, sl) => s + (parseFloat(sl.amount) || 0), 0);
  
  // ФИНАЛЬНАЯ ФОРМУЛА ИЗДЕРЖЕК ЗА МЕСЯЦ:
  // Постоянные + Закупки + ЗП Мастеров - Чистый доход от субаренды
  const allExpenses = mainExpenses + extrasTotal + salariesTotal - subrentAmount;

  // Генерируем выпадающий список (архив) за последние 24 рабочих месяца
  const monthOptions = useMemo(() => {
    const ms = new Set();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      ms.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(ms);
  }, [now]);

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* СЕЛЕКТОР ПЕРИОДА (Выбор месяца) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-[22px] border border-slate-100 shadow-2xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Учет операционных издержек</h2>
          <p className="text-xs text-slate-400 mt-0.5">Зарплаты, аренда, коммуналка и закупки</p>
        </div>
        <select 
          className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer text-slate-700 shadow-3xs" 
          value={month} 
          onChange={e => setMonth(e.target.value)}
        >
          {monthOptions.map(m => <option key={m} value={m}>{mLabel(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* ЛЕВАЯ СТОРОНА: Формы ввода счетов и ЗП */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* БЛОК 1: ПОСТОЯННЫЕ РАСХОДЫ */}
          <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase border-b border-slate-50 pb-2">Постоянные счета мастерской</h3>
            
            <div className="space-y-1">
              {providers.map(p => (
                <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-none gap-4 group relative" key={p.key}>

                  {editingKey === p.key ? (
                    // Режим редактирования названия статьи расходов
                    <div className="flex items-center space-x-2 flex-1 animate-fade-in">
                      <input
                        className="border px-3 py-1.5 text-xs rounded-lg w-full max-w-[200px] outline-none focus:ring-2 focus:ring-blue-500"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                      />
                      <button
                        className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded text-xs font-bold hover:bg-emerald-100"
                        onClick={() => {
                          setProviders(providers.map(pr => pr.key === p.key ? { ...pr, name: editName } : pr));
                          setEditingKey(null);
                        }}
                      >
                        ✓ Сохранить
                      </button>
                    </div>
                  ) : (
                    // Обычный режим просмотра названия статьи
                    <div className="flex items-center space-x-2 flex-1">
                      <span className="text-sm font-semibold text-slate-700">{p.name}</span>
                      {p.sign === -1 && <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Доход</span>}
                      <button
                        type="button"
                        className="text-slate-300 hover:text-blue-500 text-sm transition-colors p-1"
                        onClick={() => { setEditingKey(p.key); setEditName(p.name); }}
                        title="Изменить название статьи"
                      >
                        ✏️
                      </button>
                    </div>
                  )}

                  {/* Инпут ввода суммы */}
                  <input
                    className={`border text-right px-4 py-2 rounded-xl text-sm font-bold outline-none transition-all w-32 shrink-0 ${p.sign === -1 ? 'bg-emerald-50/30 text-emerald-700 border-emerald-200 focus:bg-emerald-50' : 'bg-slate-50 text-slate-800 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500'}`}
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={data[p.key] || ""}
                    onChange={e => setVal(p.key, e.target.value)}
                  />

                  {/* Кнопка удаления для пользовательских статей */}
                  {p.key.startsWith("custom_") && (
                    <button
                      type="button"
                      className="absolute -right-1 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 text-xl font-bold px-2 transition-all opacity-0 group-hover:opacity-100"
                      onClick={() => removeProvider(p.key)}
                      title="Удалить статью"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}

              {/* Форма добавления новой статьи расходов */}
              {addingProvider ? (
                <div className="flex items-center gap-3 pt-3 animate-fade-in">
                  <input
                    className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex-1 bg-blue-50 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Название статьи расходов..."
                    value={newProviderName}
                    onChange={e => setNewProviderName(e.target.value)}
                    autoFocus
                  />
                  <button
                    className="bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-600 transition-colors"
                    onClick={addProvider}
                  >
                    ✓ Добавить
                  </button>
                  <button
                    className="bg-slate-100 text-slate-500 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                    onClick={() => { setAddingProvider(false); setNewProviderName(""); }}
                  >
                    ✕ Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-500 px-4 py-2.5 rounded-xl font-bold transition-all w-full mt-3"
                  onClick={() => setAddingProvider(true)}
                >
                  + Добавить новый
                </button>
              )}
            </div>
            
            {utilTotal > 0 && (
              <div className="text-[11px] text-slate-500 text-right pt-3 font-medium tracking-wide border-t border-slate-50">
                Итого коммуналка (Свет+Вода): <span className="font-bold text-slate-800">{fmt(utilTotal)}</span>
              </div>
            )}
          </div>

          {/* БЛОК 2: ЗАРПЛАТНЫЕ ВЕДОМОСТИ */}
          <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase border-b border-slate-50 pb-2">Выплаченные зарплаты ювелирам (Нетто)</h3>
            
            <div className="space-y-3">
              {salaries.map((sl, i) => (
                <div key={i} className="flex gap-3 items-center animate-fade-in relative group">
                  <input 
                    className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-700 flex-1 bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                    placeholder="Имя сотрудника" 
                    value={sl.name || ""} 
                    onChange={e => setSalary(i, "name", e.target.value)} 
                  />
                  <input 
                    className="border border-slate-200 text-right px-4 py-2.5 rounded-xl text-sm bg-slate-50 font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all w-36" 
                    type="number" 
                    min="0" 
                    placeholder="0.00" 
                    value={sl.amount || ""} 
                    onChange={e => setSalary(i, "amount", e.target.value)} 
                  />
                  <button 
                    className="absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 text-xl font-bold px-2 transition-colors opacity-0 group-hover:opacity-100" 
                    title="Удалить строку" 
                    onClick={() => removeSalary(i)}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-4 border-t border-slate-50">
              <button 
                className="text-xs border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-500 px-4 py-2.5 rounded-xl font-bold transition-all w-full sm:w-auto" 
                onClick={addSalary}
              >
                + Добавить сотрудника
              </button>
              {salariesTotal > 0 && (
                <div className="text-xs font-bold text-slate-500">
                  Всего к выплате: <span className="text-indigo-600 text-lg font-black ml-2">{fmt(salariesTotal)}</span>
                </div>
              )}
            </div>
          </div>

          {/* БЛОК 3: ВНЕПЛАНОВЫЕ ЗАКУПКИ (Оборудование, кофе и т.д.) */}
          <div className="bg-white p-6 rounded-[24px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase border-b border-slate-50 pb-2">Внеплановые траты и закупки</h3>
            
            <div className="space-y-3">
              {extras.map((ex, i) => (
                <div key={i} className="flex gap-3 items-center animate-fade-in relative group">
                  <input 
                    className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 flex-1 bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                    placeholder="Описание (Напр: Сверла, Кофе)" 
                    value={ex.name || ""} 
                    onChange={e => setExtra(i, "name", e.target.value)} 
                  />
                  <input 
                    className="border border-slate-200 text-right px-4 py-2.5 rounded-xl text-sm bg-slate-50 font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all w-36" 
                    type="number" 
                    min="0" 
                    placeholder="0.00" 
                    value={ex.amount || ""} 
                    onChange={e => setExtra(i, "amount", e.target.value)} 
                  />
                  <button 
                    className="absolute -right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500 text-xl font-bold px-2 transition-colors opacity-0 group-hover:opacity-100" 
                    onClick={() => setData({ ...data, extras: extras.filter((_, j) => j !== i) })}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            
            <div className="pt-2">
              <button 
                className="text-xs border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-500 px-4 py-2.5 rounded-xl font-bold transition-all w-full sm:w-auto" 
                onClick={() => setData({ ...data, extras: [...extras, { name: "", amount: "" }] })}
              >
                + Добавить закупку
              </button>
            </div>
          </div>

        </div>

        {/* ПРАВАЯ СТОРОНА: ИТОГОВОЕ РЕЗЮМЕ ТРАТ (Дашборд-блок) */}
        <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[24px] shadow-xl space-y-6 sticky top-28">
          
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 tracking-wider uppercase border-b border-slate-800 pb-3 mb-4">
              Резюме расходов за {mLabel(month)}
            </h3>
            
            <div className="space-y-3.5 text-sm font-medium">
              <div className="flex justify-between items-center text-slate-300">
                <span>ЖКХ (Свет + Вода):</span>
                <span className="font-bold text-white">{fmt(utilTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Прочие опер. траты:</span>
                <span className="font-bold text-white">{fmt(mainExpenses - utilTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Внеплановые закупки:</span>
                <span className="font-bold text-white">{fmt(extrasTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 pt-2 border-t border-slate-800">
                <span>Фонд оплаты труда (ЗП):</span>
                <span className="font-bold text-white">{fmt(salariesTotal)}</span>
              </div>
              
              {/* Вычет субаренды подсвечивается зеленым */}
              {subrentAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-400 bg-emerald-950/30 p-3 rounded-xl border border-emerald-900/50 mt-4">
                  <span>Субаренда (Доход):</span>
                  <span className="font-black text-emerald-500">+{fmt(subrentAmount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">ИТОГО ИЗДЕРЖЕК:</span>
            <span className="text-3xl font-serif font-black text-rose-400 tracking-tight block">
              {fmt(allExpenses)}
            </span>
            <span className="text-[10px] text-slate-500 mt-2 block leading-relaxed">
              * Эта сумма будет вычтена из валового дохода мастерской на вкладке «Статистика» для расчета чистой прибыли.
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

export default ExpensesTab;