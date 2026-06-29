# Changelog — Vaugold Workshop CRM

## [2026-06-29] — Bugfix + public deploy

### 🐛 Исправлено

#### Critical: `totalKirill is not defined` в `CncTab.jsx`
- **Что было:** JSX-выражение `{fmt(totalKirill)}` падало с ReferenceError при первом рендере вкладки CNC / VAU.
- **Причина (каскад):** `dataAdapter.buildSelectList()` слепо добавлял колонки `created_at`/`updated_at` в SELECT-запрос. В таблицах `cnc_clients`, `cnc_items`, `sources` этих колонок нет → Postgres возвращает `400 column "cnc_clients.created_at" does not exist`. `useStorage()` ловил ошибку, но в HMR-окружении это создавало нестабильное состояние компонента, и JSX стрелял в `totalKirill`.
- **Что сделали:**
  - `src/services/dataAdapter.js`: убрали слепое добавление `created_at`/`updated_at`. Теперь `buildSelectListAsync()` через кэш `tableHasCols()` проверяет существование колонок один раз и подстраивается под таблицу.
  - `src/features/CncTab.jsx`: `totalKirill` и `engravingTotals` обёрнуты в `(arr || []).reduce(...)` — теперь на undefined не падает. JSX использует `fmt(totalKirill || 0)` как последний рубеж.

#### Minor: warning `is_active may not exist`
- В таблице `sources` `is_active` есть, но если бы не было — упал бы тот же запрос. Сделано: SELECT идёт в 2 шага (сначала базовые колонки, потом `is_active` отдельным запросом если `softDelete: true`).

### 🚀 Деплой
- Production build в `dist/` (681 KB JS / 52 KB CSS, gzip 171+9 KB).
- `_redirects` для SPA-фолбэка на статических хостингах (Netlify/Cloudflare Pages).
- Готовый зип для загрузки на любой хостинг: см. `vaugold-build.zip`.

### ⚠️ Не сделано (требует ручных действий в Supabase Dashboard)
- [ ] **Миграция 003** должна быть применена. В БД `vaugold.role = 'master_sikupilli'` (а должно быть `'master_vaugold'`). Чек-constraint в таблице `users` НЕ содержит `master_vaugold` — нужно выполнить:
  ```sql
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('superuser', 'master_sikupilli', 'master_vaugold'));
  UPDATE users SET role = 'master_vaugold' WHERE username = 'vaugold';
  ```
- [ ] Сменить дефолтные пароли (`admin/789`, `sikupilli/1122`, `vaugold/1122`).
- [ ] Включить RLS на таблицах (минимум на `users`).
- [ ] Хешировать пароли (`bcrypt`) — перейти на Supabase Auth.

### 📁 Структура архива
```
vaugold-workshop-v1.1.zip
├── vaugold-workshop/             ← исходники с фиксами
│   ├── src/
│   │   ├── services/dataAdapter.js   ← ИСПРАВЛЕНО
│   │   └── features/CncTab.jsx       ← ИСПРАВЛЕНО
│   ├── dist/                    ← production build
│   ├── CHANGELOG.md             ← этот файл
│   ├── README.md
│   └── ... (всё как было)
├── ANALYSIS.md                  ← полный аудит проекта
└── vaugold-build.zip            ← только dist/ для деплоя
```

### 🔗 Live URL после деплоя
- https://nktxk4rhth10.space.minimax.io
