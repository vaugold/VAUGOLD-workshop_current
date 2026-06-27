// src/services/fieldMap.js
// Карта соответствия полей: фронт (camelCase, settings-blob) ↔ новая БД (snake_case, реляционные таблицы).
// Используется dataAdapter для чтения/записи без потери полей.

/**
 * Описание ключа в dataAdapter:
 *  - type: 'array' | 'object' — что хранится во фронте
 *  - table: имя таблицы в Supabase (для array + есть таблица)
 *  - fields: { camel: snake } — известные скалярные поля, которые едут в таблицу
 *  - leftover: список camelCase-полей, которых НЕТ в таблице — сохраняем в settings._leftover
 *  - storageKey: какой ключ в settings использовать для хранения leftover
 *    (для большинства ключей = '<orig>_leftover_v1')
 *  - arrayItemKey: (для sources/cnc_items) что лежит в элементах ('name' | 'id+name')
 *  - notes: пояснения
 *
 * Если для ключа нет новой таблицы — ставим table:null, и тогда ключ целиком живёт в settings.
 */

// Обратная карта snake_case → camelCase, чтобы при чтении из БД вернуть фронту привычный формат.
export const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

export const camelToSnake = (s) => s
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase();

// === КОНФИГ ПО КЛЮЧАМ ===
export const KEY_CONFIG = {
  // Заказы (Изготовление) → таблица orders
  ws_orders_v5: {
    type: 'array',
    table: 'orders',
    fields: {
      id: 'id',
      orderNumber: 'order_number',
      orderNumber2: 'order_number_2',
      orderTitle: 'order_title',
      serviceType: 'service_type',
      isRepeat: 'is_repeat',
      crossSell: 'cross_sell',
      isDraft: 'is_draft',
      category: 'category',
      status: 'status',
      awaitingClient: 'awaiting_client',
      transportVauSiku: 'transport_vau_siku',
      transportSikuVau: 'transport_siku_vau',
      orderDate: 'order_date',
      deadline: 'deadline',
      deadline3d: 'deadline_3d',
      workDoneDate: 'work_done_date',
      deliveryDate: 'delivery_date',
      markup: 'markup',
      productionCost: 'production_cost',
      masterTask: 'master_task',
      comment: 'comment',
      reported: 'reported',
      reportedDate: 'reported_date',
      assignedMaster: 'assigned_master',
      model3dDone: 'model_3d_done',
      clientTotal: 'client_total',
      clientTotalWithVat: 'client_total_with_vat',
      workTotal: 'work_total',
      stagesTotal: 'stages_total',
      extrasCost: 'extras_cost',
      extrasPrice: 'extras_price',
      outsourceCost: 'outsource_cost',
      coatingOutsource: 'coating_outsource',
      projectIncome: 'project_income',
      balance: 'balance',
      prepayment: 'prepayment',
      prepaymentDate: 'prepayment_date',
      paymentDate: 'payment_date',
      paymentMethod: 'payment_method',
      paymentStatus: 'payment_status',
      finalPaymentDate: 'final_payment_date',
      finalPaymentMethod: 'final_payment_method',
      finalToAdd: 'final_to_add',
      finalToReturn: 'final_to_return',
      vat: 'vat',
      finalWeight: 'final_weight',
      finalWeightWithLoss: 'final_weight_with_loss',
      metalGiven: 'metal_given',
      isL24: 'is_l24',
      l24Commission: 'l24_commission',
      l24OweUs: 'l24_owe_us',
      l24Prepayment: 'l24_prepayment',
      l24Remaining: 'l24_remaining',
      l24PaymentMethod: 'l24_payment_method',
      l24PaymentStatus: 'l24_payment_status',
      l24PrepaymentDate: 'l24_prepayment_date',
      l24PrepaymentMethod: 'l24_prepayment_method',
      client2Name: 'client_2_name',
      client2Phone: 'client_2_phone',
      client2Email: 'client_2_email',
      showClient2: 'show_client_2',
      withStones: 'with_stones',
    },
    // ИСПРАВЛЕНО 2026-06-27: убрали 'images' из leftover. Фото хранятся ТОЛЬКО в ws_img_v1_<id>
    // (загружаются отдельно через loadAllImages). Дубликат в leftover раздувал JSON до 19 MB.
    leftover: ['_src', 'clientName', 'clientPhone', 'clientEmail', 'extras', 'stages', 'location', 'source', 'vatEnabled'],
    storageKey: 'ws_orders_v5_leftover_v1',
    notes: 'orders: client_id/location_id/source_id оставлены как есть (FK). Имена клиентов и строковые location/source — в leftover. images — только в ws_img_v1_<id>, никогда в leftover.',
  },

  // Ремонты → таблица repairs
  ws_repairs_v1: {
    type: 'array',
    table: 'repairs',
    fields: {
      id: 'id',
      orderNumber: 'order_number',
      projectName: 'project_name',
      isRepeat2: 'is_repeat_2',
      isRepeat: 'is_repeat',
      crossSell: 'cross_sell',
      isDraft: 'is_draft',
      receptionStatus: 'reception_status',
      masterStatus: 'master_status',
      returnedToPoint: 'returned_to_point',
      courierVauSiku: 'courier_vau_siku',
      courierSikuVau: 'courier_siku_vau',
      awaitingClient: 'awaiting_client',
      orderDate: 'order_date',
      deadline: 'deadline',
      deliveryDate: 'delivery_date',
      delivery: 'delivery',
      prepayment: 'prepayment',
      paymentMethod: 'payment_method',
      finalPaymentMethod: 'final_payment_method',
      vatEnabled: 'vat_enabled',
      l24PaymentStatus: 'l24_payment_status',
      l24PaymentDate: 'l24_payment_date',
      reported: 'reported',
      reportedDate: 'reported_date',
      comment: 'comment',
      balance: 'balance',
      balanceWithVat: 'balance_with_vat',
      totalPrice: 'total_price',
      totalWithVat: 'total_with_vat',
      vat: 'vat',
      netIncome: 'net_income',
      extrasCost: 'extras_cost',
      extrasPrice: 'extras_price',
      l24Commission: 'l24_commission',
      masterName: 'master_name',
      finalPaymentDate: 'final_payment_date',
      showClient2: 'show_client_2',
      client2Name: 'client_2_name',
      client2Phone: 'client_2_phone',
      client2Email: 'client_2_email',
    },
    // ИСПРАВЛЕНО 2026-06-27: убрали 'images' из leftover. Фото хранятся ТОЛЬКО в ws_img_v1_<id>
    leftover: ['clientName', 'clientPhone', 'clientEmail', 'extras', 'items', 'location', 'source', 'pickupPoint'],
    storageKey: 'ws_repairs_v1_leftover_v1',
    notes: 'repairs: client_id/location_id/source_id/pickup_point_id — FK, оставлены как есть. images — только в ws_img_v1_<id>, никогда в leftover.',
  },

  // CNC-заказы → таблица cnc_orders
  ws_cnc_v1: {
    type: 'array',
    table: 'cnc_orders',
    fields: {
      id: 'id',
      item: 'item',
      projectName: 'project_name',
      orderDate: 'order_date',
      deadline: 'deadline',
      deliveryDate: 'delivery_date',
      paymentDate: 'payment_date',
      status: 'status',
      paymentStatus: 'payment_status',
      modelCost: 'model_cost',
      cuttingCost: 'cutting_cost',
      cuttingTime: 'cutting_time',
      modelTime: 'model_time',
      purchasedModel: 'purchased_model',
      purchasedModelCost: 'purchased_model_cost',
      comment: 'comment',
      netIncome: 'net_income',
      clientTotal: 'client_total',
      kirillShare: 'kirill_share',
      workshopShare: 'workshop_share',
    },
    leftover: ['_src', 'clientId'],
    storageKey: 'ws_cnc_v1_leftover_v1',
    notes: 'cnc_orders: clientName — поле таблицы. clientId в старом формате — это имя, мапим в client_name.',
    // Спец-правило: clientId → client_name
    fieldAliases: { clientId: 'client_name' },
  },

  // CNC-клиенты → таблица cnc_clients
  ws_cnc_clients_v1: {
    type: 'array',
    table: 'cnc_clients',
    fields: { name: 'name' },
    leftover: ['phone'],
    storageKey: 'ws_cnc_clients_v1_leftover_v1',
    notes: 'cnc_clients: id генерируется автоматически. phone — в leftover.',
  },

  // CNC-типы изделий → таблица cnc_items (это просто список строк → таблица {id,name})
  ws_cnc_items_v1: {
    type: 'array',
    table: 'cnc_items',
    fields: { name: 'name' },
    leftover: [],
    storageKey: null,
    notes: 'cnc_items: старая форма — массив строк. Новая — [{id, name}].',
    arrayItemKey: 'name', // значение элемента
  },

  // Источники трафика → таблица sources
  ws_sources_v1: {
    type: 'array',
    table: 'sources',
    fields: { name: 'name' },
    leftover: [],
    storageKey: null,
    notes: 'sources: массив строк → таблица с {id,name,is_active}.',
    arrayItemKey: 'name',
    softDelete: true, // удалённые помечаем is_active=false
  },

  // Пользователи → таблица users
  ws_users_v1: {
    type: 'array',
    table: 'users',
    fields: {
      username: 'username',
      password: 'password_hash',
      role: 'role',
      name: 'name',
    },
    leftover: [],
    storageKey: null,
    notes: 'users: пароль лежит в password_hash (без хеширования — как и было в старой схеме).',
  },

  // === КЛЮЧИ, КОТОРЫЕ ЦЕЛИКОМ ЖИВУТ В settings (нет новой таблицы) ===
  ws_custom_types_v1: { type: 'array', table: null, storageKey: 'ws_custom_types_v1' },
  ws_providers_v1: { type: 'array', table: null, storageKey: 'ws_providers_v1' },
  ws_expenses_v1: { type: 'object', table: null, storageKey: 'ws_expenses_v1' },
  system_settings: { type: 'object', table: null, storageKey: 'system_settings' },
};