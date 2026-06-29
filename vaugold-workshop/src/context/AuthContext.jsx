// src/context/AuthContext.jsx
// Контекст авторизации. Использует dataAdapter для работы с пользователями (таблица users).
//
// ОТКАТ 2026-06-27: возврат к кастомной авторизации (plaintext в users.password_hash).
// Supabase Auth + RLS отключены — вернулись к схеме, которая работает «из коробки» без миграций.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadArray, saveArray } from '../services/dataAdapter';

const AuthContext = createContext(null);

// Роли пользователей
export const ROLES = {
  SUPERUSER: 'superuser',        // Владелец - полный доступ
  MASTER_SIKUPILLI: 'master_sikupilli',  // Мастер Sikupilli - квитанции EM, точка Sikupilli
  MASTER_VAUGOLD: 'master_vaugold'       // ИСПРАВЛЕНО 2026-06-27: Мастер Vaugold - квитанции OM, точка Vaugold
};

// ИСПРАВЛЕНО 2026-06-27: workaround для CHECK constraint в БД.
// В БД у нас роль хранится одна (master_sikupilli), а реальная роль определяется по username.
// Это позволяет не делать ALTER TABLE / DROP CONSTRAINT.
// Чтобы добавить нового мастера: добавить username → ROLES ниже.
const USERNAME_TO_ROLE = {
  'vaugold': ROLES.MASTER_VAUGOLD,
  'sikupilli': ROLES.MASTER_SIKUPILLI,
  'user_om': ROLES.MASTER_VAUGOLD,         // legacy алиас
  'user123': ROLES.MASTER_SIKUPILLI,       // legacy алиас
};

const applyRoleOverride = (user) => {
  if (!user) return user;
  const realRole = USERNAME_TO_ROLE[user.username];
  if (realRole) return { ...user, role: realRole };
  return user;
};

// Дефолтные пользователи (используются как fallback, если БД недоступна)
// ВАЖНО: при любых изменениях паролей — обновлять здесь тоже!
// id здесь нет — для fallback; в БД у пользователей есть свои UUID.
const DEFAULT_USERS = [
  {
    username: 'admin',
    password: '789',             // ИСПРАВЛЕНО 2026-06-27: пароль изменён
    role: ROLES.SUPERUSER,
    name: 'Администратор'
  },
  {
    username: 'sikupilli',       // ИСПРАВЛЕНО 2026-06-27: переименован user123 → sikupilli
    password: '1122',
    role: ROLES.MASTER_SIKUPILLI,
    name: 'мастер Sikupilli'
  },
  {
    username: 'vaugold',         // ИСПРАВЛЕНО 2026-06-27: переименован user_om → vaugold
    password: '1122',
    role: ROLES.MASTER_VAUGOLD,
    name: 'мастер Vaugold'
  }
];
const DEFAULT_SUPERUSER = DEFAULT_USERS[0]; // Для обратной совместимости

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  // Загрузка списка пользователей из Supabase (через адаптер → таблица users)
  const loadUsers = useCallback(async () => {
    try {
      const data = await loadArray('ws_users_v1');
      const list = Array.isArray(data) && data.length > 0 ? data : DEFAULT_USERS;
      // ИСПРАВЛЕНО 2026-06-27: применяем role override ко всем юзерам (для UI UserManagement)
      setAllUsers(list.map(applyRoleOverride));
      if (!Array.isArray(data) || data.length === 0) {
        await saveArray('ws_users_v1', DEFAULT_USERS);
      }
    } catch (e) {
      console.error('Load users error:', e);
      setAllUsers(DEFAULT_USERS.map(applyRoleOverride));
    }
  }, []);

  // Сохранение списка пользователей (через адаптер)
  const saveUsers = async (users) => {
    window._savingCount = (window._savingCount || 0) + 1;
    try {
      await saveArray('ws_users_v1', users);
      setAllUsers(users);
    } catch (e) {
      console.error('Save users error:', e);
    } finally {
      window._savingCount = Math.max(0, (window._savingCount || 1) - 1);
    }
  };

  // Проверка сохраненной сессии при загрузке
  useEffect(() => {
    let cancelled = false;
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[Auth] Safety timeout — показываем LoginPage');
        setLoading(false);
      }
    }, 4000);

    const initAuth = async () => {
      try {
        await Promise.race([
          loadUsers(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('loadUsers timeout')), 3000))
        ]);
      } catch (e) {
        console.warn('[Auth] loadUsers не удался:', e.message);
        setAllUsers(DEFAULT_USERS);
      }
      if (cancelled) return;
      clearTimeout(safetyTimeout);

      const savedSession = localStorage.getItem('vaugold_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          const users = allUsers.length > 0 ? allUsers : DEFAULT_USERS;
          const user = users.find(u => u.username === session.username);
          if (user) {
            setCurrentUser(user);
          } else {
            localStorage.removeItem('vaugold_session');
          }
        } catch (e) {
          localStorage.removeItem('vaugold_session');
        }
      }
      setLoading(false);
    };
    initAuth();
    return () => { cancelled = true; clearTimeout(safetyTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (allUsers.length > 0 && currentUser) {
      const updated = allUsers.find(u => u.username === currentUser.username);
      if (updated && JSON.stringify(updated) !== JSON.stringify(currentUser)) {
        // ИСПРАВЛЕНО 2026-06-27: применяем role override при восстановлении сессии
        setCurrentUser(applyRoleOverride(updated));
        const session = localStorage.getItem('vaugold_session');
        if (session) {
          const parsed = JSON.parse(session);
          localStorage.setItem('vaugold_session', JSON.stringify({ username: updated.username }));
        }
      }
    }
  }, [allUsers]);

  const login = async (username, password) => {
    const users = allUsers.length > 0 ? allUsers : DEFAULT_USERS;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      // ИСПРАВЛЕНО 2026-06-27: применяем role override по username
      const finalUser = applyRoleOverride(user);
      localStorage.setItem('vaugold_session', JSON.stringify({ username: finalUser.username }));
      setCurrentUser(finalUser);
      return { success: true };
    }

    return { success: false, error: 'Неверное имя пользователя или пароль' };
  };

  const logout = () => {
    localStorage.removeItem('vaugold_session');
    setCurrentUser(null);
  };

  const registerUser = async (userData) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для регистрации' };
    }

    const users = [...allUsers];
    const existing = users.find(u => u.username === userData.username);
    if (existing) {
      return { success: false, error: 'Пользователь с таким именем уже существует' };
    }

    // ИСПРАВЛЕНО 2026-06-27: при регистрации сохраняем выбранную роль (а не всегда MASTER_SIKUPILLI)
    const newUser = { ...userData, role: userData.role || ROLES.MASTER_SIKUPILLI };

    users.push(newUser);
    await saveUsers(users);
    // Перезагружаем — чтобы получить UUID, сгенерированный БД для нового юзера
    await loadUsers();
    return { success: true };
  };

  const updateUser = async (username, updates) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для редактирования' };
    }

    const users = allUsers.map(u =>
      u.username === username ? { ...u, ...updates } : u
    );
    await saveUsers(users);
    // Перезагружаем — чтобы подтянуть актуальное состояние
    await loadUsers();

    return { success: true };
  };

  const deleteUser = async (username) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для удаления' };
    }

    if (username === currentUser.username) {
      return { success: false, error: 'Нельзя удалить себя' };
    }

    const users = allUsers.filter(u => u.username !== username);
    await saveUsers(users);
    await loadUsers();
    return { success: true };
  };

  const isSuperuser = currentUser?.role === ROLES.SUPERUSER;
  const isMasterSikupilli = currentUser?.role === ROLES.MASTER_SIKUPILLI;
  const isMasterVaugold = currentUser?.role === ROLES.MASTER_VAUGOLD; // ИСПРАВЛЕНО 2026-06-27
  const isAnyMaster = isMasterSikupilli || isMasterVaugold;            // ИСПРАВЛЕНО 2026-06-27: общий флаг "это мастер"

  return (
    <AuthContext.Provider value={{
      currentUser,
      allUsers,
      loading,
      login,
      logout,
      registerUser,
      updateUser,
      deleteUser,
      isSuperuser,
      isMasterSikupilli,
      isMasterVaugold,      // ИСПРАВЛЕНО 2026-06-27
      isAnyMaster,          // ИСПРАВЛЕНО 2026-06-27
      reloadUsers: loadUsers
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};