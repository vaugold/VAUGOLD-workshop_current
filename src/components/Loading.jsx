// src/components/Loading.jsx
// ИСПРАВЛЕНО 2026-06-27: компонент скелетона/лоадера. Показывается пока данные из Supabase летят.

import React from 'react';

// === СКЕЛЕТОН ДЛЯ ЖУРНАЛА ЗАКАЗОВ ===
export const OrdersSkeleton = ({ rows = 5 }) => (
  <div className="space-y-3 animate-pulse">
    {/* Шапка с фильтрами */}
    <div className="flex gap-2 mb-4">
      <div className="h-9 w-24 bg-slate-200 rounded-lg"></div>
      <div className="h-9 w-32 bg-slate-200 rounded-lg"></div>
      <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
    </div>
    {/* Строки заказов */}
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-4">
        <div className="h-12 w-12 bg-slate-200 rounded-lg flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-1/3"></div>
          <div className="h-3 bg-slate-100 rounded w-1/2"></div>
        </div>
        <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
      </div>
    ))}
    <div className="text-center text-slate-400 text-xs mt-4">
      <span className="inline-block w-2 h-2 bg-sky-400 rounded-full animate-pulse mr-2"></span>
      Загружаем заказы из Supabase...
    </div>
  </div>
);

// === СКЕЛЕТОН ДЛЯ РЕМОНТОВ ===
export const RepairsSkeleton = ({ rows = 4 }) => (
  <div className="space-y-3 animate-pulse">
    <div className="flex gap-2 mb-4">
      <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
      <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 flex items-center gap-4">
        <div className="h-10 w-10 bg-slate-200 rounded-full flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/5"></div>
          <div className="h-3 bg-slate-100 rounded w-3/5"></div>
        </div>
        <div className="space-y-2">
          <div className="h-5 w-16 bg-slate-100 rounded-full"></div>
          <div className="h-3 w-20 bg-slate-100 rounded"></div>
        </div>
      </div>
    ))}
    <div className="text-center text-slate-400 text-xs mt-4">
      <span className="inline-block w-2 h-2 bg-sky-400 rounded-full animate-pulse mr-2"></span>
      Загружаем ремонты из Supabase...
    </div>
  </div>
);

// === УНИВЕРСАЛЬНЫЙ СПИННЕР ===
export const Spinner = ({ size = 'md', text = '' }) => {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size];
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <svg className={`${sizeClass} animate-spin text-slate-400`} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {text && <span className="text-sm font-medium">{text}</span>}
    </div>
  );
};