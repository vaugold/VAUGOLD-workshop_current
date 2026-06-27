// src/WorkshopTracker.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useStorage from './hooks/useStorage';
import { supabase } from './services/supabase';
import { loadAllImages, loadImagesForOrder, saveImages as adapterSaveImages, deleteImages as adapterDeleteImages } from './services/dataAdapter';
import { useAuth, ROLES } from './context/AuthContext';

// Компоненты UI
import ImageViewer from './components/ImageViewer';
import SaveStatus from './components/SaveStatus';
import { OrdersSkeleton, RepairsSkeleton, Spinner } from './components/Loading';

// Вкладки
import LoginPage from './features/LoginPage';
import OrderForm from './features/OrderForm';
import OrdersTab from './features/OrdersTab';
import OrderReceipt from './features/OrderReceipt';
import RepairsTab from './features/RepairsTab';
import CncTab from './features/CncTab';
import ContactsTab from './features/ContactsTab';
import StatsTab from './features/StatsTab';
import RepairStatsTab from './features/RepairStatsTab';
import ExpensesTab from './features/ExpensesTab';
import UserManagement from './features/UserManagement';

import { INITIAL_PROVIDERS } from './utils/constants';

export const WorkshopTracker = () => {
  // === АВТОРИЗАЦИЯ ===
  const { currentUser, loading, logout, isSuperuser, isMasterSikupilli, isMasterVaugold, isAnyMaster } = useAuth();

  // Управление навигацией и просмотрщиком фото
  const [tab, setTab] = useState("repairs");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null); // Для редактирования из журнала
  const [orderReceipt, setOrderReceipt] = useState(null); // Чек заказа

  // --- ГЛОБАЛЬНЫЕ СТЕЙТЫ (Связь с базой данных Supabase) ---
  // Внимание: важно не менять ключи 'ws_orders_v5' и прочие, иначе потеряется связь со старыми данными
  // ИСПРАВЛЕНО 2026-06-27: useStorage теперь возвращает 4-е значение reload() для ручного обновления
  const [orders, setOrders, ordersLoaded, reloadOrders] = useStorage("ws_orders_v5", []);
  const [repairs, setRepairs, repairsLoaded, reloadRepairs] = useStorage("ws_repairs_v1", []);
  const [cncOrders, setCncOrders] = useStorage("ws_cnc_v1", []);
  const [cncClients, setCncClients] = useStorage("ws_cnc_clients_v1", []);
  const [cncItems, setCncItems] = useStorage("ws_cnc_items_v1", []);
  const [customTypes, setCustomTypes] = useStorage("ws_custom_types_v1", []);
  const [expenses, setExpenses] = useStorage("ws_expenses_v1", {});
  const [providers, setProviders] = useStorage("ws_providers_v1", INITIAL_PROVIDERS);
  const [sources, setSources] = useStorage("ws_sources_v1", ["Meta","TikTok","YouTube","Рекомендация","Витрина","Сайт","AI","Другое"]);

  // --- РАЗДЕЛЬНОЕ ХРАНЕНИЕ ФОТО (Защита от переполнения базы) ---
  // Чтобы база не падала от 10-мегабайтных JSON-ов с картинками, мы храним фото отдельно
  // по ключам ws_img_v1_IDЗАКАЗА
  const [orderImages, setOrderImages] = useState({});
  const [migrating, setMigrating] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // ИСПРАВЛЕНО: индикатор ручного refresh

  // Утилитная функция для глобальных статусов сохранения (UI индикатор)
  const pushSaveStatus = (state, msg = '') => {
    window._saveStatus = { state, msg };
    (window._saveListeners || []).forEach(fn => { try { fn(state, msg); } catch(e) {} });
  };

  // 1. Загрузка фотографий.
  // ИСПРАВЛЕНО 2026-06-27 v2: убрана массовая загрузка ВСЕХ фото (19 MB!) — перешли на ленивую
  // загрузку по требованию через ensureOrderImages(id). Фото грузятся только для открытого/расширенного заказа.
  useEffect(() => {
    // Пока ничего не загружаем — ждём явного вызова ensureOrderImages(id) из вкладок/форм.
    // Совместимость: некоторые старые компоненты могут проверять orderImages[id] — для них
    // гарантируем что ключ всегда есть (хотя бы как []).
  }, []);

  // === ИСПРАВЛЕНО 2026-06-27 v2: ленивая загрузка фото одного заказа ===
  // Кэш в state orderImages[id]. Повторные вызовы для одного id не делают запрос (мгновенно).
  const ensureOrderImages = useCallback(async (orderId) => {
    const id = String(orderId);
    // Уже в кэше — отдаём без запроса
    if (id in orderImages) return orderImages[id];
    // Идёт загрузка — возвращаем тот же promise (защита от дабл-клика)
    if (window._imgLoadingPromises && window._imgLoadingPromises[id]) return window._imgLoadingPromises[id];

    window._imgLoadingPromises = window._imgLoadingPromises || {};
    const p = (async () => {
      try {
        const imgs = await loadImagesForOrder(id);
        setOrderImages(prev => ({...prev, [id]: imgs}));
        return imgs;
      } catch (e) {
        console.warn(`[images] load failed for ${id}:`, e.message);
        setOrderImages(prev => ({...prev, [id]: []}));
        return [];
      } finally {
        delete window._imgLoadingPromises[id];
      }
    })();
    window._imgLoadingPromises[id] = p;
    return p;
  }, [orderImages]);

  // === Ленивая загрузка фото для нескольких заказов разом (с лимитом параллельности) ===
  const ensureOrderImagesBulk = useCallback(async (orderIds, concurrency = 6) => {
    const ids = orderIds.map(String).filter(id => !(id in orderImages));
    if (ids.length === 0) return;
    // Параллельно, но не больше concurrency за раз — чтобы не нагружать Supabase
    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      await Promise.all(chunk.map(id => ensureOrderImages(id)));
    }
  }, [orderImages, ensureOrderImages]);

  // === ИСПРАВЛЕНО 2026-06-27: ручное обновление всех данных (без polling) ===
  // v2: фотки не подгружаем массово — пользователь сам откроет нужный заказ
  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    pushSaveStatus('saving');
    try {
      await Promise.all([
        reloadOrders(),
        reloadRepairs(),
      ]);
      // Очищаем кэш фото — форсируем перезагрузку при следующем обращении
      setOrderImages({});
      pushSaveStatus('ok');
    } catch (e) {
      pushSaveStatus('error', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, reloadOrders, reloadRepairs]);

  // 2. Функция изолированного сохранения фото (через адаптер)
  const _saveImagesForOrder = useCallback(async (orderId, imgs) => {
    window._savingCount = (window._savingCount || 0) + 1;
    pushSaveStatus('saving');
    try {
      await adapterSaveImages(orderId, imgs);
      setOrderImages(prev => ({...prev, [orderId]: imgs}));
      pushSaveStatus('ok');
    } catch(e) {
      pushSaveStatus('error', e.message);
    } finally {
      window._savingCount = Math.max(0, (window._savingCount||1) - 1);
      window._isSaving = window._savingCount > 0;
    }
  }, []);

  // --- МИГРАЦИИ И ПОДДЕРЖКА СТАРЫХ ДАННЫХ ---
  // Миграция источников: переименовываем Facebook/Instagram в Meta
  useEffect(() => {
    if (!sources) return;
    if (sources.includes("Instagram") || sources.includes("Facebook")) {
      setSources(sources.map(s => s === "Instagram" ? "Meta" : s).filter(s => s !== "Facebook"));
    }
  }, [sources, setSources]);

  // Ручная кнопка "Исправить фото" для переноса старых вшитых фото в новую структуру
  const runMigration = useCallback(async () => {
    const hasEmbedded = (orders||[]).some(o => o.images && o.images.length > 0);
    const hasLegacy = Object.keys(orderImages).length > 0;
    if (!hasEmbedded && !hasLegacy) { alert('Фотографии уже хранятся правильно ✅'); return; }
    if (!window.confirm('Перенести фотографии в отдельное хранилище?\n\nЗаймёт около 30 секунд.')) return;
    setMigrating(true);
    try {
      const cleanOrders = [];
      for (const o of (orders||[])) {
        if (o.images && o.images.length > 0) {
          await _saveImagesForOrder(String(o.id), o.images);
          cleanOrders.push({...o, images: []}); // Очищаем массив фоток в самом заказе
        } else {
          cleanOrders.push(o);
        }
      }
      await setOrders(cleanOrders);
      alert('✅ Готово! Теперь сохранение будет быстрым.');
    } catch(e) {
      alert('Ошибка миграции: ' + e.message);
    } finally {
      setMigrating(false);
    }
  }, [orders, orderImages, setOrders, _saveImagesForOrder]);

  // --- СШИВАНИЕ ДАННЫХ ДЛЯ UI ---
  // UI-компонентам отдаем заказ вместе с фотографиями
  const ordersWithImages = useMemo(() => 
    (orders||[]).map(o => ({...o, images: (orderImages||{})[o.id] || o.images || []})),
  [orders, orderImages]);

  // Глобальная обертка над сохранением: режет фото из объекта заказа и шлет их отдельно
  const _saveWithImages = useCallback(async (o, newOrdersList) => {
    const imgs = o.images && o.images.length > 0 ? o.images : null;
    const orderNoImg = {...o, images: []}; // Убираем тяжелые картинки
    if (imgs) await _saveImagesForOrder(String(o.id), imgs);
    setOrders(newOrdersList(orderNoImg));
  }, [_saveImagesForOrder, setOrders]);

  // Экспортируемые функции для вкладок
  const saveOrder = useCallback(o => _saveWithImages(o, stripped => [stripped, ...(orders||[])]), [orders, _saveWithImages]);
  const updateOrder = useCallback(o => _saveWithImages(o, stripped => (orders||[]).map(x => x.id === stripped.id ? stripped : x)), [orders, _saveWithImages]);
  const deleteOrder = useCallback(id => {
    setOrders((orders||[]).filter(o => o.id !== id));
    setOrderImages(prev => { const n = {...prev}; delete n[id]; return n; });
    // Не забываем удалить ключ фоток из БД
    adapterDeleteImages(id).catch(e => console.warn('deleteImages:', e.message));
  }, [orders, setOrders]);

  // Конфигурация вкладок для СУПЕРПОЛЬЗОВАТЕЛЯ (полный доступ)
  const superuserTabs = [
    { id: "new-order", icon: "💎", label: "Новый заказ" },
    { id: "order-journal", icon: "📋", label: "Журнал заказов" },
    { id: "repairs", icon: "🔧", label: "Ремонты" },
    { id: "cnc", icon: "⚙️", label: "3D / CNC" },
    { id: "contacts", icon: "👥", label: "Клиенты" },
    { id: "stats", icon: "📊", label: "Фин. Отчет" },
    { id: "repair-stats", icon: "📉", label: "KPI Ремонтов" },
    { id: "expenses", icon: "💳", label: "Расходы" },
    { id: "users", icon: "⚙️", label: "Пользователи" }
  ];

  // Конфигурация вкладок для МАСТЕРОВ (только ремонты и клиенты) — одинаковая для обоих мастеров
  // ИСПРАВЛЕНО 2026-06-27: masterTabs теперь работает для всех ролей мастеров
  const masterTabs = [
    { id: "repairs", icon: "🔧", label: "Ремонты" },
    { id: "contacts", icon: "👥", label: "Клиенты" }
  ];

  // Выбираем вкладки в зависимости от роли (ИСПРАВЛЕНО 2026-06-27: используем isAnyMaster)
  const tabsConfig = isSuperuser ? superuserTabs : masterTabs;

  // При входе любого мастера — сразу открываем вкладку "Ремонты"
  useEffect(() => {
    if (currentUser && isAnyMaster && !tabsConfig.find(t => t.id === tab)) {
      setTab("repairs");
    }
  }, [currentUser, isAnyMaster, tab, tabsConfig]);

  // === ЭКРАН ЗАГРУЗКИ ===
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-black text-2xl tracking-tighter">V</span>
          </div>
          <div className="text-white font-medium">Загрузка...</div>
        </div>
      </div>
    );
  }

  // === ЭКРАН ВХОДА ===
  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-700 selection:bg-blue-100 selection:text-blue-900 pb-20">

      {/* НАВИГАЦИЯ */}
      <header className="glass-nav sticky top-0 z-50 transition-all duration-300 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex justify-between items-center h-16 sm:h-20">
          <div className="flex items-center space-x-2 sm:space-x-3 cursor-default">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20">
              <span className="text-white font-black text-sm sm:text-xl tracking-tighter">V</span>
            </div>
            <div>
              <span className="text-base sm:text-lg font-black tracking-tight text-slate-900 block leading-none">VAUGOLD</span>
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400 block mt-0.5">Workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Мобильное меню кнопка */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <svg className="w-6 h-6 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <nav className="hidden lg:flex p-1 bg-slate-100/80 rounded-2xl border border-slate-200/50 shadow-sm">
              {tabsConfig.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
                  className={`relative px-4 py-2 rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-300 ease-out flex items-center gap-2 ${
                    tab === t.id
                      ? 'bg-slate-900 text-white shadow-md shadow-slate-900/30'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Мобильное выпадающее меню */}
            {mobileMenuOpen && (
              <div className="lg:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-lg z-40">
                <div className="p-4 space-y-1">
                  {tabsConfig.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
                      className={`w-full text-left px-4 py-3 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-3 ${
                        tab === t.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Информация о пользователе и выход */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-800">{currentUser.name || currentUser.username}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isSuperuser ? 'Администратор' : 'Мастер'}
                </div>
              </div>
              {/* ИСПРАВЛЕНО 2026-06-27: кнопка ручного обновления (заменила polling) */}
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="p-2 sm:p-2.5 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-100 transition-all border border-sky-200 disabled:opacity-50 disabled:cursor-wait"
                title="Обновить данные"
              >
                <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={logout}
                className="p-2 sm:p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-all border border-rose-200"
                title="Выйти"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ОСНОВНОЙ КОНТЕНТ */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 mt-4 sm:mt-8 animate-slide-up">
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {tabsConfig.find(t => t.id === tab)?.label}
          </h1>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
            {/* ИСПРАВЛЕНО 2026-06-27: пока данные летят, показываем индикатор, а не «0 зак» */}
            {(!ordersLoaded || refreshing) ? (
              <span className="flex items-center gap-2 text-sky-600">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Загружаем...
              </span>
            ) : (
              <span>{ordersWithImages.length} зак · {cncOrders.length} CNC</span>
            )}
          </div>
        </div>

        <div className="transition-all duration-300 bg-white p-4 sm:p-6 md:p-8 rounded-[16px] sm:rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">

          {tab === "new-order" && <OrderForm orders={ordersWithImages} saveOrder={saveOrder} updateOrder={updateOrder} editingOrder={editingOrder} onCancelEdit={() => { setEditingOrder(null); }} customTypes={customTypes} sources={sources} allRepairs={repairs} allCnc={cncOrders} ensureOrderImages={ensureOrderImages} onOpenViewer={(imgs, i) => setViewerPhoto({images: imgs, idx: i})} />}

          {/* ИСПРАВЛЕНО 2026-06-27: пока данные грузятся — скелетон, а не пустой «0 заказ» */}
          {tab === "order-journal" && (
            ordersLoaded
              ? <OrdersTab orders={ordersWithImages} setOrders={setOrders} deleteOrder={deleteOrder} ensureOrderImages={ensureOrderImages} ensureOrderImagesBulk={ensureOrderImagesBulk} onOpenViewer={(imgs, i) => setViewerPhoto({images: imgs, idx: i})} onEditOrder={(o) => { setEditingOrder(o); setTab("new-order"); }} onOpenReceipt={(o) => setOrderReceipt(o)} />
              : <OrdersSkeleton rows={6} />
          )}

          {tab === "repairs" && (
            repairsLoaded
              ? <RepairsTab repairs={repairs} setRepairs={setRepairs} allOrders={ordersWithImages} allCnc={cncOrders} sources={sources} ensureOrderImages={ensureOrderImages} onOpenViewer={(imgs, i) => setViewerPhoto({images: imgs, idx: i})} />
              : <RepairsSkeleton rows={5} />
          )}

          {/* Сюда прокинуты updateOrder и editOrder, чтобы Кирилл мог изменять статус 3D из вкладки VAU */}
          {tab === "cnc" && <CncTab cncOrders={cncOrders} setCncOrders={setCncOrders} cncClients={cncClients} setCncClients={setCncClients} cncItems={cncItems} setCncItems={setCncItems} orders={ordersWithImages} ensureOrderImages={ensureOrderImages} updateOrder={updateOrder} editOrder={(o) => { /* Находим заказ в базе и перекидываем во вкладку */ setTab("orders"); setTimeout(()=> { const btn = document.querySelector(`[data-edit-order="${o.id}"]`); if(btn) btn.click(); }, 300); }} onOpenViewer={(imgs, i) => setViewerPhoto({images: imgs, idx: i})} />}

          {tab === "contacts" && <ContactsTab orders={ordersWithImages} repairs={repairs} cncOrders={cncOrders} setOrders={setOrders} />}

          {tab === "stats" && <StatsTab orders={ordersWithImages} cncOrders={cncOrders} repairs={repairs} expenses={expenses} providers={providers} />}

          {tab === "repair-stats" && <RepairStatsTab repairs={repairs} />}

          {tab === "expenses" && <ExpensesTab expenses={expenses} setExpenses={setExpenses} providers={providers} setProviders={setProviders} />}

          {tab === "users" && isSuperuser && <UserManagement />}

        </div>
      </main>

      <SaveStatus />

      {/* Просмотрщик фото (передаем src только если фото существует) */}
      {viewerPhoto && viewerPhoto.images && viewerPhoto.images[viewerPhoto.idx] && (
        <ImageViewer src={viewerPhoto.images[viewerPhoto.idx]} onClose={() => setViewerPhoto(null)} />
      )}

      {/* Чек заказа */}
      {orderReceipt && (
        <OrderReceipt order={orderReceipt} onClose={() => setOrderReceipt(null)} customTypes={customTypes} />
      )}
    </div>
  );
};

export default WorkshopTracker;