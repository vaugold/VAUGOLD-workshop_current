// Одноразовая миграция: удалить поле "source" у всех существующих ремонтов
// (т.к. ввели только 2 точки приёма, источник больше не хранится).

const fs = require('fs');

const envPath = '/workspace/jewelry-crm/VAUGOLD-workshop_current-main/vau_workshop-main/.env';
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}

const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const SETTINGS_KEY = 'ws_repairs_v1_leftover_v1';

async function api(method, qs, body) {
  const url = `${URL}/rest/v1/settings${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
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
    const rows = await api('GET', `key=eq.${SETTINGS_KEY}&select=data`);
    if (!rows.length) {
      console.log(`⚠️ Ключа ${SETTINGS_KEY} ещё нет — нечего чистить.`);
      return;
    }
    const leftoverMap = rows[0].data || {};
    const ids = Object.keys(leftoverMap);
    console.log(`Записей в leftover: ${ids.length}`);

    let removed = 0;
    for (const id of ids) {
      const rec = leftoverMap[id];
      if (rec && 'source' in rec) {
        delete rec.source;
        removed++;
      }
    }
    console.log(`Удалено поле source: у ${removed} записей`);

    if (removed === 0) {
      console.log('✅ Поле source уже отсутствует. Нечего делать.');
      return;
    }
    const putRows = await api('PATCH', `key=eq.${SETTINGS_KEY}`, { data: leftoverMap });
    console.log(`✅ Записано обратно. Обновлено строк: ${putRows.length}`);
  } catch (e) {
    console.error('Ошибка:', e.message);
    process.exit(1);
  }
})();