# Vaugold Workshop CRM

CRM для ювелирной мастерской Vaugold (Эстония). React 18 + Vite + Supabase.

## 🚀 Быстрый старт

```bash
# 1. Установи зависимости
npm install

# 2. Создай .env (если его нет) — должен содержать:
#    VITE_SUPABASE_URL=https://...
#    VITE_SUPABASE_ANON_KEY=sb_...
#    (Эти значения уже в .env, можешь редактировать)

# 3. Запусти dev-сервер
npm run dev
# Откроется на http://localhost:5173

# Или собери прод-бандл:
npm run build
npm run preview
```

## 👥 Логины

| Логин | Пароль | Роль |
|-------|--------|------|
| `admin` | `789` | Администратор |
| `sikupilli` | `1122` | Мастер Sikupilli (квитанции EM, точка Sikupilli) |
| `vaugold` | `1122` | Мастер Vaugold (квитанции OM, точка Vaugold) |

## 📁 Структура

```
vau_workshop-main/
├── .env                          # Supabase URL + anon key
├── index.html                    # HTML-оболочка
├── package.json                  # Зависимости
├── vite.config.js                # Vite конфиг
├── tailwind.config.js            # Tailwind (ИСПРАВЛЕНО: убран CDN)
├── postcss.config.js             # PostCSS pipeline
├── vercel.json                   # SPA redirect для Vercel
├── src/
│   ├── main.jsx                  # Bootstrap
│   ├── WorkshopTracker.jsx       # Главный контейнер
│   ├── context/AuthContext.jsx   # Авторизация (ИСПРАВЛЕНО: маппинг username→role)
│   ├── hooks/
│   │   ├── useStorage.js         # (ИСПРАВЛЕНО: убран 30s polling)
│   │   └── useAutoSave.js        # Черновики в localStorage
│   ├── services/
│   │   ├── supabase.js           # Supabase клиент
│   │   ├── dataAdapter.js        # (ИСПРАВЛЕНО: select + батчи)
│   │   └── fieldMap.js           # (ИСПРАВЛЕНО: убран images из leftover)
│   ├── features/                 # Вкладки
│   │   ├── LoginPage.jsx
│   │   ├── OrderForm.jsx         # (ИСПРАВЛЕНО: lazy images)
│   │   ├── OrdersTab.jsx         # (ИСПРАВЛЕНО: lazy images)
│   │   ├── RepairsTab.jsx        # (ИСПРАВЛЕНО: lazy images)
│   │   ├── CncTab.jsx
│   │   ├── ContactsTab.jsx
│   │   ├── StatsTab.jsx
│   │   ├── RepairStatsTab.jsx
│   │   ├── ExpensesTab.jsx
│   │   ├── UserManagement.jsx    # (ИСПРАВЛЕНО: выбор роли мастера)
│   │   └── OrderReceipt.jsx
│   ├── components/               # UI-компоненты
│   │   ├── ClientSearch.jsx
│   │   ├── DateInput.jsx
│   │   ├── DraftBanner.jsx
│   │   ├── ImageViewer.jsx
│   │   ├── Loading.jsx           # (ИСПРАВЛЕНО: скелетоны)
│   │   └── SaveStatus.jsx
│   ├── utils/                    # Хелперы
│   │   ├── constants.js          # Мастера, типы изделий
│   │   ├── calculations.js       # calcOrder, calcCNC
│   │   └── helpers.js            # (ИСПРАВЛЕНО: префикс OM)
│   ├── index.css                 # Tailwind директивы + кастомные стили
│   └── index.html
└── supabase/
    └── migrations/
        ├── 001_auth_and_rls.sql    # НЕ активна (Fix #7 был откачен)
        ├── 002_add_master_vaugold.sql # НЕ активна (сделано в обход)
        └── 003_create_vaugold_user.sql # НЕ активна (сделано в обход)
```

## 🔧 Что было сделано (2026-06-27)

### Производительность
- ✅ **Fix #1**: убрали дубликат фото в leftover (19 MB → 39 KB)
- ✅ **Fix #2**: убрали 30s polling (был лишний трафик)
- ✅ **Fix #3**: добавили скелетоны при загрузке
- ✅ **Fix #4**: SELECT конкретных колонок + батчи при сохранении
- ✅ **Fix #5**: ленивая загрузка фото (по 1.5 MB за заказ)
- ✅ **Fix #6**: Tailwind CDN → PostCSS (2.7 MB → 48 KB)

### Безопасность
- ⏸ **Fix #7** (Supabase Auth + RLS) — **откачен**, т.к. требует ручного SQL

### Бизнес-логика
- ✅ Новый мастер **Vaugold (OM)** на точке Vaugold
- ✅ Все три юзера обновлены (admin/789, sikupilli/1122, vaugold/1122)

## 🗄️ Состояние БД

После всех изменений в таблице `users`:

| username | role (в БД) | password_hash | Реальная роль (в UI) |
|----------|-------------|---------------|----------------------|
| admin | superuser | 789 | superuser |
| sikupilli | master_sikupilli | 1122 | master_sikupilli |
| vaugold | master_sikupilli | 1122 | master_vaugold ← override по username |

**Workaround**: реальная роль определяется в `AuthContext.jsx` через `USERNAME_TO_ROLE` (CHECK constraint в БД не пропускает `master_vaugold`, поэтому в БД хранится фейк).

## 🚀 Деплой

```bash
# Вариант 1: Vercel
vercel deploy

# Вариант 2: статический хостинг
npm run build
# dist/ → загрузи на любой статический хостинг (S3, Cloudflare Pages, Netlify)
```

## 📋 TODO (если будешь развивать)

- Переехать на Supabase Auth (требует ALTER TABLE → ручной SQL)
- Supabase Storage для фото (URL вместо base64)
- Code-splitting (сейчас 655 KB JS одним файлом)
- Реальные индексы на FK и датах