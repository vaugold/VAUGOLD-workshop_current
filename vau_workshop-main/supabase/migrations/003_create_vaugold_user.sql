-- =============================================================
-- VAUGOLD WORKSHOP CRM — миграция #003
-- Дата: 2026-06-27
-- Назначение: создать пользователя vaugold (master_vaugold, пароль 1122)
--
-- КАК ЗАПУСТИТЬ:
--   1. Открой https://supabase.com/dashboard/project/rlxaiwtjiheqiwnlmqrn/sql
--   2. Вставь этот файл целиком в редактор
--   3. Нажми "Run" (Ctrl+Enter)
-- =============================================================

-- 1) Убеждаемся что CHECK-ограничение поддерживает master_vaugold
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('superuser', 'master_sikupilli', 'master_vaugold'));

-- 2) Создаём пользователя vaugold
INSERT INTO users (username, password_hash, role, name)
VALUES ('vaugold', '1122', 'master_vaugold', 'мастер Vaugold')
ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  name = EXCLUDED.name;

-- 3) Проверка
SELECT username, password_hash, role, name FROM users ORDER BY username;