// Одноразовая миграция: проставить всем существующим ремонтам pickupPoint="Vaugold" и location="Vaugold"
// (т.к. раньше не было EM, всё что было оформлено — на VAU).
//
// Запуск: node migrate_vaugold.cjs
//
// Скрипт идёт напрямую через REST API Supabase с anon-ключом (RLS отключён).

const fs = require('fs');
const path = require('path');

// Загружаем .env вручную (простой парсинг, без зависимостей)
const envPath = '/workspace/jewelry-crm/VAUGOLD-workshop_current-main/vau_workshop-main/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const SETTINGS_KEY = 'ws_repairs_v1_leftover_v1';

if (!URL || !KEY) {
  console.error('Не найдены VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env');
  process.exit(1);
}

async function api(method, qs, body) {
  const url = `${URL}/rest/v1/settings${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'PATCH' || method === 'POST' ? 'return=representation' : 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${method} ${url} → ${res.status}: ${txt}`);
  }
  return res.json();
}

(async () => {
  try {
    // 1. Получаем текущий leftover-блок
    const rows = await api('GET', `key=eq.${SETTINGS_KEY}&select=data`);
    if (!rows.length) {
      console.log(`⚠️ Ключа ${SETTINGS_KEY} ещё нет в БД — миграция не требуется (нет ремонтов).`);
      return;
    }
    const leftoverMap = rows[0].data || {};
    const ids = Object.keys(leftoverMap);
    console.log(`Найдено записей в leftover: ${ids.length}`);

    // 2. Проставляем VAU тем, у кого нет pickupPoint (или он "Sikupilli" / пустой)
    let updated = 0;
    let alreadyVau = 0;
    for (const id of ids) {
      const rec = leftoverMap[id];
      if (!rec) continue;
      const cur = (rec.pickupPoint || '').toString();
      if (cur === 'Vaugold') { alreadyVau++; continue; }
      rec.pickupPoint = 'Vaugold';
      // location тоже — для согласованности (используется в разных местах)
      if (!rec.location || rec.location === 'Sikupilli') rec.location = 'Vaugold';
      updated++;
    }

    console.log(`Уже VAU: ${alreadyVau}, обновлено: ${updated}`);

    if (updated === 0) {
      console.log('✅ Все записи уже на VAU. Миграция не требуется.');
      return;
    }

    // 3. Записываем обратно
    const putRows = await api('PATCH', `key=eq.${SETTINGS_KEY}`, { data: leftoverMap });
    console.log(`✅ Записано обратно. Ответ: ${putRows.length} строк обновлено.`);
  } catch (e) {
    console.error('Ошибка:', e.message);
    process.exit(1);
  }
})();