// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

// Роли пользователей
export const ROLES = {
  SUPERUSER: 'superuser',        // Владелец - полный доступ
  MASTER_SIKUPILLI: 'master_sikupilli'  // Мастер Sikupilli - только ремонты и клиенты
};

// Дефолтные пользователи (используются как fallback, если БД недоступна)
// ВАЖНО: при любых изменениях паролей — обновлять здесь тоже!
const DEFAULT_USERS = [
  {
    username: 'admin',
    password: 'odindvatri',  // Актуальный пароль админа (должен совпадать с БД)
    role: ROLES.SUPERUSER,
    name: 'Администратор'
  },
  {
    username: 'user123',
    password: '123123123',
    role: ROLES.MASTER_SIKUPILLI,
    name: 'masterok'
  }
];
const DEFAULT_SUPERUSER = DEFAULT_USERS[0]; // Для обратной совместимости

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  // Загрузка списка пользователей из Supabase
  const loadUsers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('data')
        .eq('key', 'ws_users_v1')
        .single();

      if (data?.data && Array.isArray(data.data)) {
        setAllUsers(data.data);
      } else {
        // Если нет пользователей, создаем дефолтных
        await saveUsers(DEFAULT_USERS);
        setAllUsers(DEFAULT_USERS);
      }
    } catch (e) {
      console.error('Load users error:', e);
      // Fallback: используем встроенных дефолтных пользователей (если БД недоступна)
      setAllUsers(DEFAULT_USERS);
    }
  }, []);

  // Сохранение списка пользователей
  const saveUsers = async (users) => {
    window._savingCount = (window._savingCount || 0) + 1;
    try {
      await supabase.from('settings').upsert({ key: 'ws_users_v1', data: users }, { onConflict: 'key' });
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
    // Safety net: даже если loadUsers() зависнет, через 4 секунды покажем LoginPage
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[Auth] Safety timeout — показываем LoginPage');
        setLoading(false);
      }
    }, 4000);

    const initAuth = async () => {
      try {
        // Загружаем пользователей с таймаутом 3 секунды
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

  // Обновляем текующего пользователя когда загрузились пользователи
  useEffect(() => {
    if (allUsers.length > 0 && currentUser) {
      const updated = allUsers.find(u => u.username === currentUser.username);
      if (updated && JSON.stringify(updated) !== JSON.stringify(currentUser)) {
        setCurrentUser(updated);
        const session = localStorage.getItem('vaugold_session');
        if (session) {
          const parsed = JSON.parse(session);
          localStorage.setItem('vaugold_session', JSON.stringify({ username: updated.username }));
        }
      }
    }
  }, [allUsers]);

  // Вход
  const login = async (username, password) => {
    const users = allUsers.length > 0 ? allUsers : DEFAULT_USERS;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      localStorage.setItem('vaugold_session', JSON.stringify({ username: user.username }));
      setCurrentUser(user);
      return { success: true };
    }

    return { success: false, error: 'Неверное имя пользователя или пароль' };
  };

  // Выход
  const logout = () => {
    localStorage.removeItem('vaugold_session');
    setCurrentUser(null);
  };

  // Регистрация нового пользователя (только для суперпользователя)
  const registerUser = async (userData) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для регистрации' };
    }

    const users = [...allUsers];
    const existing = users.find(u => u.username === userData.username);
    if (existing) {
      return { success: false, error: 'Пользователь с таким именем уже существует' };
    }

    const newUser = {
      ...userData,
      role: ROLES.MASTER_SIKUPILLI
    };

    users.push(newUser);
    await saveUsers(users);
    return { success: true };
  };

  // Редактирование пользователя (только для суперпользователя)
  const updateUser = async (username, updates) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для редактирования' };
    }

    const users = allUsers.map(u =>
      u.username === username ? { ...u, ...updates } : u
    );
    await saveUsers(users);

    if (currentUser.username === username) {
      setCurrentUser(users.find(u => u.username === username));
    }

    return { success: true };
  };

  // Удаление пользователя (только для суперпользователя)
  const deleteUser = async (username) => {
    if (currentUser?.role !== ROLES.SUPERUSER) {
      return { success: false, error: 'Нет прав для удаления' };
    }

    if (username === currentUser.username) {
      return { success: false, error: 'Нельзя удалить себя' };
    }

    const users = allUsers.filter(u => u.username !== username);
    await saveUsers(users);
    return { success: true };
  };

  const isSuperuser = currentUser?.role === ROLES.SUPERUSER;
  const isMasterSikupilli = currentUser?.role === ROLES.MASTER_SIKUPILLI;

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