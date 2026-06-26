// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext(null);

// Роли пользователей
export const ROLES = {
  SUPERUSER: 'superuser',        // Владелец - полный доступ
  MASTER_SIKUPILLI: 'master_sikupilli'  // Мастер Sikupilli - только ремонты и клиенты
};

// Дефолтный суперпользователь (создается при первом входе)
const DEFAULT_SUPERUSER = {
  username: 'admin',
  password: 'vaugold2024', // Пароль по умолчанию
  role: ROLES.SUPERUSER,
  name: 'Администратор'
};

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
        // Если нет пользователей, создаем дефолтного админа
        await saveUsers([DEFAULT_SUPERUSER]);
        setAllUsers([DEFAULT_SUPERUSER]);
      }
    } catch (e) {
      console.error('Load users error:', e);
      setAllUsers([DEFAULT_SUPERUSER]);
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
  // ⚠️ ВРЕМЕННО: авторизация отключена — сразу заходим как админ.
  // Чтобы вернуть логин: заменить строку `setCurrentUser(DEFAULT_SUPERUSER)` ниже
  // на оригинальный блок с проверкой `localStorage.getItem('vaugold_session')`.
  useEffect(() => {
    const initAuth = async () => {
      await loadUsers();
      // === АВТО-ЛОГИН как админ (без логина) ===
      setCurrentUser(DEFAULT_SUPERUSER);
      setLoading(false);
    };
    initAuth();
  }, []);

  // Обновляем текущего пользователя когда загрузились пользователи
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
    const users = allUsers.length > 0 ? allUsers : [DEFAULT_SUPERUSER];
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