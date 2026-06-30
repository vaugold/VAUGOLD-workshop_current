# Vaugold Workshop CRM — установка и запуск

## Что внутри

- React 18 + Vite 5 + Tailwind 3.4 (без CDN)
- БД: Supabase (Postgres)
- `@supabase/supabase-js` 2.39+
- Хранилище фото: ленивая загрузка по ключам `ws_img_v1_<orderId>` в `settings`
- Diff-sync между фронтом (camelCase JSON) и БД (snake_case реляционные таблицы) — `src/services/dataAdapter.js`

## Требования

- Node.js ≥ 18
- npm ≥ 9
- Аккаунт Supabase (https://supabase.com)

## Шаги

### 1. Установить зависимости

```bash
cd vaugold-clean
npm install
```

### 2. Создать `.env` из шаблона

```bash
cp .env.example .env
```

Заполни:
```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Где взять:
- Зайди в https://app.supabase.com → выбери проект → Settings → API
- `Project URL` → в `VITE_SUPABASE_URL`
- `Project API keys → anon public` → в `VITE_SUPABASE_ANON_KEY`

### 3. Применить миграции (если БД пустая)

В Supabase Dashboard → SQL Editor, по очереди выполни файлы из `supabase/migrations/`:
- `002_add_master_vaugold.sql`
- `003_create_vaugold_user.sql`

Если БД уже инициализирована — пропускай.

### 4. Запустить dev-сервер

```bash
npm run dev
```

Откроется на http://localhost:5173

### 5. Войти

Дефолтные креды (см. `src/context/AuthContext.jsx`):
- `admin` / `789` → superuser (полный доступ)
- `sikupilli` / `1122` → мастер (только ремонты + клиенты)
- `vaugold` / `1122` → мастер (только ремонты + клиенты)

> ⚠️ Пароли хранятся **plaintext** в таблице `users`. Это техдолг, см. ниже.

## Сборка для продакшна

```bash
npm run build      # → dist/
npm run preview    # локально посмотреть билд
```

Готовый `dist/` можно деплоить на Vercel / Netlify / любой статический хостинг. Vercel подхватит `vercel.json` автоматически.

## Структура проекта

```
src/
├── main.jsx                    ← точка входа + BUILD-маркер
├── WorkshopTracker.jsx         ← главный контейнер (auth, навигация)
├── index.css                   ← Tailwind + кастомные стили
├── context/
│   └── AuthContext.jsx         ← кастомная авторизация
├── hooks/
│   ├── useStorage.js           ← [val, save, loaded, reload] через dataAdapter
│   └── useAutoSave.js          ← черновики в localStorage
├── services/
│   ├── supabase.js             ← createClient
│   ├── fieldMap.js             ← KEY_CONFIG: маппинг storageKey → table + fields + leftover + dateFields + numericFields
│   └── dataAdapter.js          ← diff-sync, нулификация пустых дат/numeric, lazy images
├── features/                   ← вкладки (OrderForm, OrdersTab, RepairsTab и т.д.)
├── components/                 ← ClientSearch, DateInput, ImageViewer, SaveStatus
└── utils/
    ├── constants.js            ← MASTERS, STAGE_DEFS, REPAIR_CATEGORIES (RU/EE)
    ├── calculations.js         ← calcOrder, calcRepair — финансовая логика
    └── helpers.js              ← форматирование, генерация ID, даты
```

## Техдолг (стоит закрыть в первую очередь)

1. **Безопасность**: RLS на таблицах отключён. Любой с anon-ключом читает/пишет всё. Пароли в `users.password_hash` хранятся **plaintext**.
2. **Баг роли**: у пользователя `vaugold` в БД роль `master_sikupilli` (должна быть `master_vaugold`). AuthContext компенсирует через `USERNAME_TO_ROLE` map. Пофиксить одним UPDATE: `UPDATE users SET role='master_vaugold' WHERE username='vaugold';`
3. **`RepairsTab.jsx` — 1619 строк**, монолит. Разбить на подкомпоненты.
4. **Polling убран**, нет realtime — мастера не видят правки админа без кнопки «Обновить». Подключить `supabase.channel('orders').on('postgres_changes', ...)`.
5. **`window._savingCount`, `window._imgLoadingPromises`** — глобальные window-флаги для синхронизации. Заменить на React Context или event-bus.
6. **`migrate_*.cjs`** — захардкожен абсолютный путь к `.env`. Не запустятся на другой машине. Перевести на `dotenv` или `argv`.
7. **CRA-фоллбэк в `supabase.js`** (`process.env.REACT_APP_*`) — мёртвый код.
8. **`src/index.html`** — дубликат root `index.html`, не используется Vite-ом. Удалить.
9. **`settings` хранит legacy `ws_orders_v5`, `ws_repairs_v1` + `ws_users_v1`** — данные уже мигрированы в реальные таблицы, можно удалить ключи (осторожно — fallback в `dataAdapter.loadArray` зависит от них).
10. **Smoke-тест**: `npm run build` → `python -m http.server -d dist 8080` — убедиться что билд рабочий.

## Что починили 2026-06-30 (если что-то сломалось после)

- **Металл в доп. позициях** (OrderForm + RepairsTab): кросс-формула `вес × €/г = итого` для обоих металлов (Kuld / Hõbe). Любые 2 из 3 полей → третье считается автоматически.
- **dataAdapter.saveArray**: INSERT теперь явно добавляет `id` (раньше падало с "null value in column id").
- **dataAdapter.itemToRow**: пустые строки `""` → `null` для DATE- и NUMERIC-колонок (через `cfg.dateFields` / `cfg.numericFields` + универсальный regex по суффиксам).
- **useStorage.save**: при ошибке сохранения вылетает `alert` с текстом + BUILD-тегом (для отладки; в проде убрать).

## Миграционные .cjs скрипты

В корне лежат `migrate_clear_source.cjs` и `migrate_vaugold.cjs`. Они **не нужны для запуска** — это одноразовые утилиты, использовавшиеся при миграции на новую схему. Захардкожен абсолютный путь к `.env`, перед запуском поправь:

```js
const envPath = '/path/to/your/.env';
```

Запускаются через `node migrate_vaugold.cjs`.

## Контакты

Если что-то непонятно или сломалось — лучше всего смотреть:
1. Консоль браузера (F12) — там `[dataAdapter] nullifyEmptyTyped` логирует что заменил
2. Supabase Dashboard → Logs → postgres — там видно SQL-ошибки
3. Сам проект в `/workspace/project/ANALYSIS.md` — старый анализ проекта