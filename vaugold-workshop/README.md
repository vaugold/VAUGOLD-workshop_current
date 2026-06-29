# Vaugold Workshop CRM

CRM для ювелирной мастерской Vaugold (Эстония). React 18 + Vite + Supabase.

## 🚀 Быстрый старт (локально)

```bash
# 1. Распакуй архив и зайди в папку
cd vaugold-workshop

# 2. Установи зависимости
npm install

# 3. Создай .env по шаблону
cp .env.example .env
# затем отредактируй .env и подставь свои значения Supabase

# 4. Запусти dev-сервер
npm run dev
# Откроется на http://localhost:5173
```

## 👥 Логины по умолчанию

| Логин | Пароль | Роль |
|-------|--------|------|
| `admin` | `789` | Администратор |
| `sikupilli` | `1122` | Мастер Sikupilli (квитанции EM, точка EM) |
| `vaugold` | `1122` | Мастер Vaugold (квитанции OM, точка VAU) |

## 🗄️ Структура БД (Supabase)

| Таблица | Что хранит |
|---|---|
| `users` | Логины, пароли (plaintext), роль (superuser / master_sikupilli / master_vaugold) |
| `orders` | Заказы на изготовление |
| `repairs` | Ремонты |
| `cnc_orders` / `cnc_clients` / `cnc_items` | CNC/3D заказы |
| `sources` | Источники трафика (Meta, TikTok, YouTube, …) |
| `settings` | key/value JSON (extras, гравировка, leftovers, фото по ключу `ws_img_v1_<id>`) |

## 📁 Структура проекта

```
vaugold-workshop/
├── .env.example               # Шаблон переменных окружения
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
├── src/
│   ├── main.jsx
│   ├── WorkshopTracker.jsx    # Главный контейнер с навигацией по вкладкам
│   ├── context/AuthContext.jsx
│   ├── hooks/
│   │   ├── useStorage.js
│   │   └── useAutoSave.js
│   ├── services/
│   │   ├── supabase.js        # Клиент Supabase
│   │   ├── dataAdapter.js     # Diff-sync, leftover, адаптер фронт↔БД
│   │   └── fieldMap.js        # Карта полей camel↔snake
│   ├── features/              # Вкладки
│   │   ├── LoginPage.jsx
│   │   ├── OrderForm.jsx
│   │   ├── OrdersTab.jsx
│   │   ├── RepairsTab.jsx     # ← здесь все правки по фильтрам и гравировке
│   │   ├── CncTab.jsx         # ← здесь вкладка «Гравировка» отдельной единицей
│   │   ├── ContactsTab.jsx
│   │   ├── StatsTab.jsx
│   │   ├── RepairStatsTab.jsx
│   │   ├── ExpensesTab.jsx
│   │   ├── UserManagement.jsx
│   │   └── OrderReceipt.jsx
│   ├── components/            # UI-компоненты
│   └── utils/
├── supabase/migrations/       # SQL-миграции для БД
│   ├── 002_add_master_vaugold.sql
│   └── 003_create_vaugold_user.sql
├── migrate_vaugold.cjs        # Одноразовый скрипт: проставить VAU всем старым ремонтам
└── migrate_clear_source.cjs   # Одноразовый скрипт: удалить поле source у ремонтов
```

## 🆕 Что добавлено (2026-06-28…2026-06-29)

### Гравировка (Repairs + CNC)
- **RepairsTab**: блок «🖋 Гравировка» в форме ремонта (между позициями и финансами)
  - Переключатель вкл/выкл
  - ТЗ + фото к ТЗ
  - Поле «Стоимость (в чек)» — крупно, сверху
  - Разбивка столбиком: Kirill / Outsource / Наценка (компактно, как обычные поля ремонта)
- **Чек ремонта (RepairReceipt)**: одна строка «Graveerimine / Гравировка: X €» — без разбивки (разбивка внутренняя)
- **CncTab**: новая вкладка «🖋 Гравировка» — карточки по ремонтам с включённой гравировкой. Сводка в шапке: работ / клиенту / Кириллу / наценка

### Журнал ремонтов — фильтры и блоки
- **🟢 Активные** — вкладка: всё не выданное (для L24 ещё требуется «Оплачено»)
- **⏳ Ожидает клиента** — вкладка (фиолетовая)
- **Активный «Статус приёмщика»** в карточке ремонта (без открытия формы). При выборе «Передано мастеру» мастеру автоматически ставится «В работе»
- **📝 Итоговый комментарий** — большой блок в форме + редактируемое поле прямо в карточке журнала (с локальным черновиком + debounce 600 мс, чтобы ввод не ломался при saveArray в Supabase)
- **Фильтры по дате**: месяц / год / период (от-до) — отдельной полосой
- **Фильтр по точке приёма**: Все / EM / VAU — отдельной полосой
- **Фильтр «Курьер»**: «Все для транспортировки» / VAU→Sikupilli / Sikupilli→VAU — отдельной полосой
- **Полоса фильтров** разбита на 4 логических блока с разделителями: Статус / Курьер / Точка / Дата

### Миграции данных
- `migrate_vaugold.cjs` — проставляет `pickupPoint="Vaugold"` всем существующим ремонтам (т.к. раньше не было EM)
- `migrate_clear_source.cjs` — удаляет поле `source` из всех ремонтов

## 🔧 Запуск миграционных скриптов

```bash
# Подставь свои значения в .env, затем:
node migrate_vaugold.cjs
node migrate_clear_source.cjs
```

Скрипты идут через REST API Supabase с anon-ключом (RLS должен быть выключен, как сейчас).

## 🔐 Безопасность (TODO)

⚠️ **Внимание:** Supabase Auth + RLS пока отключены. Пароли в plaintext в таблице `users`. Перед публичным деплоем в продакшн рекомендуется:
- Включить RLS на всех таблицах
- Перейти на Supabase Auth (миграция требует ручного SQL)
- Сменить дефолтные пароли
- Хешировать пароли (bcrypt)

## 🚀 Деплой

```bash
# Вариант 1: Vercel
vercel deploy

# Вариант 2: статический хостинг
npm run build
# dist/ → загрузи на любой статический хостинг (S3, Cloudflare Pages, Netlify)
```

После билда в `dist/` нужно положить `_redirects` (для SPA-fallback на статических хостингах):

```
/*    /index.html   200
```