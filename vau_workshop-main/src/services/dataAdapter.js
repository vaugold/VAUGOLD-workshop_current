// src/services/dataAdapter.js
// Адаптер данных: единая точка чтения/записи для useStorage и AuthContext.
// Оборачивает разницу между фронтом (camelCase, settings-blob) и новой БД (snake_case, реляционные таблицы).
//
// Контракт:
//   - loadArray(key) → Promise<Array>
//   - saveArray(key, arr) → Promise<void>   (полная замена: diff+sync)
//   - loadObject(key) → Promise<Object>
//   - saveObject(key, obj) → Promise<void>
//   - loadAllImages() → Promise<{[orderId]: string[]}>  (для ws_img_v1_* ключей)
//   - saveImages(orderId, imgs) → Promise<void>
//   - deleteImages(orderId) → Promise<void>

import { supabase } from './supabase';
import { KEY_CONFIG, snakeToCamel, camelToSnake } from './fieldMap';

// =====================
// HELPERS
// =====================

const log = (...args) => console.log('[dataAdapter]', ...args);
const warn = (...args) => console.warn('[dataAdapter]', ...args);
const errlog = (...args) => console.error('[dataAdapter]', ...args);

// Удаляем ключи undefined из объекта (Supabase их не любит)
const stripUndef = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

// =====================
// SETTINGS HELPERS (для ключей без новой таблицы)
// =====================

const settingsGet = async (key) => {
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
};

const settingsUpsert = async (key, data) => {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, data }, { onConflict: 'key' });
  if (error) throw error;
};

const settingsDelete = async (key) => {
  const { error } = await supabase
    .from('settings')
    .delete()
    .eq('key', key);
  if (error) throw error;
};

// Достать все настройки разом (быстрее для пакетной загрузки)
const settingsGetMany = async (keys) => {
  if (keys.length === 0) return {};
  const { data, error } = await supabase
    .from('settings')
    .select('key, data')
    .in('key', keys);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.key] = row.data;
  return map;
};

// =====================
// ROW ↔ ITEM TRANSFORMS
// =====================

// Преобразует строку из БД (snake_case) в объект для фронта (camelCase).
// Применяет fieldAliases (спец-маппинги, напр. clientId → client_name).
const rowToItem = (row, cfg) => {
  const item = { id: row.id };
  // Сначала прямое соответствие полей
  for (const [camel, snake] of Object.entries(cfg.fields)) {
    if (snake in row) {
      item[camel] = row[snake];
    }
  }
  // Затем алиасы (перезапишут прямое соответствие если есть)
  if (cfg.fieldAliases) {
    for (const [camel, snake] of Object.entries(cfg.fieldAliases)) {
      if (snake in row) item[camel] = row[snake];
    }
  }
  return item;
};

// Обратное преобразование: item (camelCase, от фронта) → строка для БД (snake_case).
// НЕ включает leftover-поля и id.
const itemToRow = (item, cfg) => {
  const row = {};
  for (const [camel, snake] of Object.entries(cfg.fields)) {
    if (camel in item && camel !== 'id') {
      // Пропускаем алиасы (обрабатываются отдельно)
      if (cfg.fieldAliases && camel in cfg.fieldAliases) {
        row[cfg.fieldAliases[camel]] = item[camel];
      } else {
        row[snake] = item[camel];
      }
    }
  }
  // Доп. поля из алиасов (если camel нет в fields, но есть в fieldAliases)
  if (cfg.fieldAliases) {
    for (const [camel, snake] of Object.entries(cfg.fieldAliases)) {
      if (camel in item && !(camel in cfg.fields)) {
        row[snake] = item[camel];
      }
    }
  }
  return row;
};

// Собрать leftover-полей item'а в плоский объект
const extractLeftover = (item, cfg) => {
  const out = {};
  for (const k of cfg.leftover || []) {
    if (k in item) out[k] = item[k];
  }
  return out;
};

// ИСПРАВЛЕНО 2026-06-27: строим список колонок для SELECT вместо select('*').
// Возвращает строку вида 'id, order_number, status, ...' — Supabase не тащит лишние поля.
// created_at/updated_at добавляем — они нам нужны для сортировки и отладки.
const buildSelectList = (cfg) => {
  if (!cfg.fields) return '*';
  const cols = new Set(['id', 'created_at', 'updated_at']);
  for (const snake of Object.values(cfg.fields)) cols.add(snake);
  if (cfg.fieldAliases) {
    for (const snake of Object.values(cfg.fieldAliases)) cols.add(snake);
  }
  return Array.from(cols).join(', ');
};

// =====================
// ARRAY LOAD/SAVE
// =====================

export const loadArray = async (key) => {
  const cfg = KEY_CONFIG[key];
  if (!cfg) throw new Error(`Unknown key: ${key}`);
  if (cfg.type !== 'array') throw new Error(`Key ${key} is not array`);

  // Ключ без новой таблицы — читаем целиком из settings
  if (!cfg.table) {
    const data = await settingsGet(key);
    return Array.isArray(data) ? data : [];
  }

  // === Спец-случай: простой список значений (sources, cnc_items) ===
  // Возвращаем массив СТРОК, как ожидает фронт.
  if (cfg.arrayItemKey) {
    let query = supabase.from(cfg.table).select(cfg.arrayItemKey);
    // Для sources — фильтруем активные
    if (key === 'ws_sources_v1') {
      query = query.eq('is_active', true);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows || []).map(r => r[cfg.arrayItemKey]).filter(v => v != null && v !== '');
  }

  // === Стандартный путь: чтение из новой таблицы + leftover из settings ===

  // 1. Достаём строки из новой таблицы (ИСПРАВЛЕНО 2026-06-27: только нужные колонки)
  const { data: rows, error } = await supabase
    .from(cfg.table)
    .select(buildSelectList(cfg));
  if (error) throw error;

  // 2. Достаём leftover (если есть storageKey)
  let leftoverMap = {};
  if (cfg.storageKey) {
    const leftover = await settingsGet(cfg.storageKey);
    leftoverMap = (leftover && typeof leftover === 'object' && !Array.isArray(leftover)) ? leftover : {};
  }

  // 2a. FALLBACK: если leftover пуст и старый ключ существует — достаём оттуда.
  // Это делает адаптер самовосстанавливающимся: даже если leftover не заполнен
  // (например, после миграции), фронт всё равно увидит clientName, extras, stages и т.д.
  if (cfg.storageKey && Object.keys(leftoverMap).length === 0) {
    try {
      const oldData = await settingsGet(key);
      if (Array.isArray(oldData)) {
        for (const item of oldData) {
          if (!item || item.id === undefined || item.id === null) continue;
          const lf = extractLeftover(item, cfg);
          if (Object.keys(lf).length > 0) {
            leftoverMap[String(item.id)] = lf;
          }
        }
        if (Object.keys(leftoverMap).length > 0) {
          log(`[fallback] Загружено ${Object.keys(leftoverMap).length} leftover-полей из старого ${key}`);
          // Пробуем сохранить в leftover-ключ (best-effort, не ломаем если не получится)
          settingsUpsert(cfg.storageKey, leftoverMap).catch(e =>
            warn('Не удалось сохранить восстановленный leftover:', e.message)
          );
        }
      }
    } catch (e) {
      warn(`Fallback для ${key} не удался:`, e.message);
    }
  }

  // 3. Преобразуем строки и мерджим leftover
  const items = [];
  for (const row of rows || []) {
    const item = rowToItem(row, cfg);
    const idKey = String(item.id);
    if (leftoverMap[idKey]) {
      Object.assign(item, leftoverMap[idKey]);
    }
    // Защита: гарантируем что критичные поля существуют
    if (cfg.leftover) {
      for (const lf of cfg.leftover) {
        if (!(lf in item)) {
          // Значение по умолчанию для известных типов
          if (['extras', 'stages', 'items'].includes(lf)) item[lf] = [];
          else if (['images'].includes(lf)) item[lf] = [];
          else item[lf] = '';
        }
      }
    }
    items.push(item);
  }

  return items;
};

// Сохраняет массив целиком: делает diff и применяет INSERT/UPDATE/DELETE.
export const saveArray = async (key, newArr) => {
  const cfg = KEY_CONFIG[key];
  if (!cfg) throw new Error(`Unknown key: ${key}`);
  if (cfg.type !== 'array') throw new Error(`Key ${key} is not array`);

  // Ключ без новой таблицы — пишем целиком в settings
  if (!cfg.table) {
    await settingsUpsert(key, newArr);
    return;
  }

  // === Спец-случай: простой список значений (sources, cnc_items) ===
  // На входе — массив строк, обновляем таблицу.
  if (cfg.arrayItemKey && Object.keys(cfg.fields).length === 1 && cfg.fields[cfg.arrayItemKey]) {
    const newNames = new Set((newArr || []).map(v => String(v).trim()).filter(Boolean));
    
    // SELECT все текущие
    const { data: currentRows, error: selErr } = await supabase
      .from(cfg.table)
      .select(`id, ${cfg.arrayItemKey}, is_active`);
    if (selErr) throw selErr;

    const existingNames = new Map();
    for (const r of currentRows || []) {
      existingNames.set(String(r[cfg.arrayItemKey]).trim(), r);
    }

    // INSERT: новые имена — ИСПРАВЛЕНО 2026-06-27: батч вместо N+1
    const toInsertNames = [];
    const toReactivateIds = [];
    for (const name of newNames) {
      if (!existingNames.has(name)) {
        const insertObj = { [cfg.arrayItemKey]: name };
        if (cfg.softDelete) insertObj.is_active = true;
        toInsertNames.push(insertObj);
      } else {
        // Если был неактивен — реактивируем (для sources)
        const row = existingNames.get(name);
        if (cfg.softDelete && row.is_active === false) {
          toReactivateIds.push(row.id);
        }
      }
    }
    if (toInsertNames.length > 0) {
      const { error } = await supabase.from(cfg.table).insert(toInsertNames);
      if (error) throw error;
    }
    if (toReactivateIds.length > 0) {
      const { error } = await supabase.from(cfg.table).update({ is_active: true }).in('id', toReactivateIds);
      if (error) throw error;
    }

    // DELETE / soft-delete: имена в БД которых нет в newArr — ИСПРАВЛЕНО: батч
    const toSoftDeleteIds = [];
    const toHardDeleteIds = [];
    for (const [name, row] of existingNames) {
      if (!newNames.has(name)) {
        if (cfg.softDelete) toSoftDeleteIds.push(row.id);
        else toHardDeleteIds.push(row.id);
      }
    }
    if (toSoftDeleteIds.length > 0) {
      const { error } = await supabase.from(cfg.table).update({ is_active: false }).in('id', toSoftDeleteIds);
      if (error) throw error;
    }
    if (toHardDeleteIds.length > 0) {
      const { error } = await supabase.from(cfg.table).delete().in('id', toHardDeleteIds);
      if (error) throw error;
    }
    return;
  }

  // === Diff + sync ===
  const { data: currentRows, error: selErr } = await supabase
    .from(cfg.table)
    .select('id');
  if (selErr) throw selErr;

  const currentIds = new Set((currentRows || []).map(r => String(r.id)));
  const newIds = new Set(newArr.map(i => String(i.id)));

  // INSERT: новые ID
  const toInsert = newArr.filter(i => !currentIds.has(String(i.id)));
  // UPDATE: ID есть и там, и там
  const toUpdate = newArr.filter(i => currentIds.has(String(i.id)));
  // DELETE: ID есть в БД, но нет в newArr
  const toDelete = [...currentIds].filter(id => !newIds.has(String(id)));

  // INSERT — ИСПРАВЛЕНО 2026-06-27: батч вместо N+1 (было 51 запроса → стало 1)
  if (toInsert.length > 0) {
    const rows = toInsert.map(item => {
      const row = itemToRow(item, cfg);
      if (cfg.arrayItemKey) {
        const value = item[cfg.arrayItemKey];
        if (value !== undefined) row[cfg.arrayItemKey] = value;
      }
      return stripUndef(row);
    });
    const { error } = await supabase.from(cfg.table).insert(rows);
    if (error) throw error;
  }

  // UPDATE — ИСПРАВЛЕНО 2026-06-27: используем upsert с onConflict вместо N+1 UPDATE.
  // Supabase upsert умеет принять массив и при совпадении PK обновить строки.
  if (toUpdate.length > 0) {
    const rows = [];
    for (const item of toUpdate) {
      const row = itemToRow(item, cfg);
      if (cfg.arrayItemKey) {
        const value = item[cfg.arrayItemKey];
        if (value !== undefined) row[cfg.arrayItemKey] = value;
      }
      if (Object.keys(row).length === 0) continue; // нечего обновлять
      row.id = item.id; // upsert требует PK в payload
      rows.push(stripUndef(row));
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from(cfg.table)
        .upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
  }

  // DELETE — уже батч через .in() (это место ок)
  if (toDelete.length > 0) {
    // Преобразуем ID обратно к исходному типу (число или строка)
    const ids = toDelete.map(id => {
      // Если в текущих строках id был числом — вернём числом
      const orig = (currentRows || []).find(r => String(r.id) === id);
      return orig?.id ?? id;
    });
    const { error } = await supabase
      .from(cfg.table)
      .delete()
      .in('id', ids);
    if (error) throw error;
  }

  // === Сохраняем leftover в settings ===
  if (cfg.storageKey) {
    const leftoverMap = {};
    for (const item of newArr) {
      const lf = extractLeftover(item, cfg);
      if (Object.keys(lf).length > 0) {
        leftoverMap[String(item.id)] = lf;
      }
    }
    if (Object.keys(leftoverMap).length > 0) {
      // Удаляем из leftover ключи удалённых items
      const validIds = new Set(newArr.map(i => String(i.id)));
      const existingLeftover = await settingsGet(cfg.storageKey);
      if (existingLeftover && typeof existingLeftover === 'object') {
        for (const key of Object.keys(existingLeftover)) {
          if (!validIds.has(key)) {
            delete existingLeftover[key];
          }
        }
      }
      // Мерджим: новые leftover имеют приоритет, но удалённые записи вычищаем
      const finalLeftover = { ...existingLeftover, ...leftoverMap };
      // Убираем пустые
      for (const key of Object.keys(finalLeftover)) {
        if (!validIds.has(key)) delete finalLeftover[key];
      }
      if (Object.keys(finalLeftover).length > 0) {
        await settingsUpsert(cfg.storageKey, finalLeftover);
      } else {
        // Ничего не осталось — удаляем ключ
        await settingsDelete(cfg.storageKey).catch(() => {});
      }
    } else {
      // Новых leftover нет — удаляем ключ целиком
      await settingsDelete(cfg.storageKey).catch(() => {});
    }
  }

  // Возвращаем обновлённый массив (с реальными ID из БД)
  return await loadArray(key);
};

// =====================
// OBJECT LOAD/SAVE
// =====================

export const loadObject = async (key) => {
  const cfg = KEY_CONFIG[key];
  if (!cfg) throw new Error(`Unknown key: ${key}`);
  if (cfg.type !== 'object') throw new Error(`Key ${key} is not object`);
  const data = await settingsGet(cfg.storageKey || key);
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
};

export const saveObject = async (key, obj) => {
  const cfg = KEY_CONFIG[key];
  if (!cfg) throw new Error(`Unknown key: ${key}`);
  if (cfg.type !== 'object') throw new Error(`Key ${key} is not object`);
  await settingsUpsert(cfg.storageKey || key, obj);
};

// =====================
// IMAGES (отдельные ключи ws_img_v1_<id>)
// =====================

export const loadAllImages = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('key, data')
    .like('key', 'ws_img_v1_%');
  if (error) throw error;
  const out = {};
  for (const row of data || []) {
    const id = String(row.key).replace('ws_img_v1_', '');
    out[id] = row.data;
  }
  return out;
};

// ИСПРАВЛЕНО 2026-06-27: ленивая загрузка фото одного заказа. Вместо 19 MB за раз —
// по 1.5 MB за заказ, только когда пользователь реально открывает заказ/фото.
export const loadImagesForOrder = async (orderId) => {
  const key = `ws_img_v1_${orderId}`;
  const { data, error } = await supabase
    .from('settings')
    .select('data')
    .eq('key', key)
    .maybeSingle();
  if (error) { warn(`loadImagesForOrder(${orderId}) failed:`, error.message); return []; }
  return Array.isArray(data?.data) ? data.data : [];
};

export const saveImages = async (orderId, imgs) => {
  const key = `ws_img_v1_${orderId}`;
  if (!imgs || imgs.length === 0) {
    // Если пусто — удаляем ключ
    await settingsDelete(key).catch(() => {});
  } else {
    await settingsUpsert(key, imgs);
  }
};

export const deleteImages = async (orderId) => {
  await settingsDelete(`ws_img_v1_${orderId}`).catch((e) => {
    warn('deleteImages failed (may not exist):', e.message);
  });
};

// =====================
// LEGACY FALLBACK (если ключ неизвестен конфигу — читаем/пишем как раньше)
// =====================

export const loadRaw = async (key, def = null) => {
  try {
    const cfg = KEY_CONFIG[key];
    if (!cfg) {
      const data = await settingsGet(key);
      return data ?? def;
    }
    if (cfg.type === 'array') return await loadArray(key);
    if (cfg.type === 'object') return await loadObject(key);
    return def;
  } catch (e) {
    errlog(`loadRaw(${key}) failed:`, e);
    return def;
  }
};

export const saveRaw = async (key, value) => {
  try {
    const cfg = KEY_CONFIG[key];
    if (!cfg) {
      await settingsUpsert(key, value);
      return value;
    }
    if (cfg.type === 'array') return await saveArray(key, value);
    if (cfg.type === 'object') {
      await saveObject(key, value);
      return value;
    }
    return value;
  } catch (e) {
    errlog(`saveRaw(${key}) failed:`, e);
    throw e;
  }
};