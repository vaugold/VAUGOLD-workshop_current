// src/features/UserManagement.jsx
import React, { useState } from 'react';
import { useAuth, ROLES } from '../context/AuthContext';
import { fmt, fmtDate } from '../utils/helpers';

// Иконка пользователя (SVG)
const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

// Иконка роли
const RoleIcon = ({ role }) => {
  if (role === ROLES.SUPERUSER) {
    return (
      <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
};

export const UserManagement = () => {
  const { currentUser, allUsers, registerUser, updateUser, deleteUser, reloadUsers } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  // ИСПРАВЛЕНО 2026-06-27: добавлено поле role в форму (master_sikupilli / master_vaugold)
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'master_sikupilli' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Формат роли на русском (ИСПРАВЛЕНО 2026-06-27: было ROLES.MASTER — не существовало; теперь отдельные лейблы для двух мастеров)
  const roleLabel = (role) => {
    if (role === ROLES.SUPERUSER) return 'Администратор';
    if (role === ROLES.MASTER_SIKUPILLI) return 'Мастер Sikupilli (EM)';
    if (role === ROLES.MASTER_VAUGOLD) return 'Мастер Vaugold (OM)';
    return role;
  };

  // Открытие формы добавления
  const handleAdd = () => {
    setEditingUser(null);
    setForm({ username: '', password: '', name: '', role: 'master_sikupilli' });
    setError('');
    setShowForm(true);
  };

  // Открытие формы редактирования
  const handleEdit = (user) => {
    setEditingUser(user.username);
    setForm({
      username: user.username,
      password: '',
      name: user.name || '',
      role: user.role || 'master_sikupilli'
    });
    setError('');
    setShowForm(true);
  };

  // Закрытие формы
  const handleCancel = () => {
    setShowForm(false);
    setEditingUser(null);
    setForm({ username: '', password: '', name: '', role: 'master_sikupilli' });
    setError('');
  };

  // Сохранение (добавление или редактирование)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.username.trim()) {
      setError('Введите имя пользователя');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      setError('Введите пароль');
      return;
    }

    if (editingUser) {
      // Редактирование
      const updates = { name: form.name };
      if (form.password.trim()) {
        updates.password = form.password;
      }
      const result = await updateUser(editingUser, updates);
      if (result.success) {
        setSuccess('Пользователь обновлен');
        handleCancel();
        reloadUsers();
      } else {
        setError(result.error);
      }
    } else {
      // Добавление нового (ИСПРАВЛЕНО 2026-06-27: передаём выбранную роль)
      const result = await registerUser({
        username: form.username.trim(),
        password: form.password,
        name: form.name,
        role: form.role
      });
      if (result.success) {
        setSuccess('Пользователь добавлен');
        handleCancel();
        reloadUsers();
      } else {
        setError(result.error);
      }
    }
  };

  // Удаление пользователя
  const handleDelete = async (username) => {
    if (!confirm(`Удалить пользователя "${username}"?`)) return;

    const result = await deleteUser(username);
    if (result.success) {
      setSuccess('Пользователь удален');
      reloadUsers();
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Управление пользователями</h2>
          <p className="text-sm text-slate-500 mt-1">Добавление, редактирование и удаление пользователей системы</p>
        </div>
        <button
          onClick={handleAdd}
          className="px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Новый пользователь
        </button>
      </div>

      {/* Сообщения */}
      {error && (
        <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium">
          {success}
        </div>
      )}

      {/* Форма добавления/редактирования */}
      {showForm && (
        <div className="mb-8 bg-white p-6 rounded-[24px] shadow-lg border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-6">
            {editingUser ? 'Редактирование пользователя' : 'Новый пользователь'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Имя пользователя *
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ivanov"
                  disabled={editingUser}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {editingUser ? 'Новый пароль (оставьте пустым)' : 'Пароль *'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Имя / ФИО
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Иван Иванов"
                />
              </div>

              {/* ИСПРАВЛЕНО 2026-06-27: выбор роли — добавлена master_vaugold (квитанции OM, точка Vaugold) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Роль
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: 'master_sikupilli' })}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                      form.role === 'master_sikupilli'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Sikupilli (EM)</div>
                    <div className={`text-[10px] mt-0.5 ${form.role === 'master_sikupilli' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Квитанции EM, точка Sikupilli
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, role: 'master_vaugold' })}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${
                      form.role === 'master_vaugold'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Vaugold (OM)</div>
                    <div className={`text-[10px] mt-0.5 ${form.role === 'master_vaugold' ? 'text-emerald-100' : 'text-slate-400'}`}>
                      Квитанции OM, точка Vaugold
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all"
              >
                {editingUser ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2.5 bg-slate-100 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-all"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Список пользователей */}
      <div className="bg-white rounded-[24px] shadow-lg border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-4 gap-4 p-5 bg-slate-50 border-b border-slate-100">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Пользователь</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Имя / ФИО</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Роль</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Действия</div>
        </div>

        {allUsers.map((user) => (
          <div
            key={user.username}
            className={`grid grid-cols-4 gap-4 p-5 border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
              user.username === currentUser?.username ? 'bg-blue-50/30' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                <UserIcon />
              </div>
              <div>
                <div className="font-semibold text-slate-800">{user.username}</div>
                {user.username === currentUser?.username && (
                  <div className="text-[10px] text-blue-600 font-bold">Вы</div>
                )}
              </div>
            </div>
            <div className="flex items-center text-sm text-slate-600">
              {user.name || '—'}
            </div>
            <div className="flex items-center gap-2">
              <RoleIcon role={user.role} />
              <span className={`text-sm font-semibold ${
                user.role === ROLES.SUPERUSER ? 'text-amber-600' : 'text-slate-600'
              }`}>
                {roleLabel(user.role)}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              {user.role !== ROLES.SUPERUSER || user.username === currentUser?.username ? (
                <button
                  onClick={() => handleEdit(user)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-200 transition-all"
                >
                  Изменить
                </button>
              ) : (
                <span className="text-xs text-slate-400 px-4 py-2">—</span>
              )}
              {user.role !== ROLES.SUPERUSER && (
                <button
                  onClick={() => handleDelete(user.username)}
                  className="px-4 py-2 bg-rose-50 text-rose-600 font-bold text-xs rounded-lg hover:bg-rose-100 transition-all border border-rose-200"
                >
                  Удалить
                </button>
              )}
            </div>
          </div>
        ))}

        {allUsers.length === 0 && (
          <div className="p-12 text-center text-slate-400">
            Нет пользователей
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;