// ИСПРАВЛЕНО 2026-06-27: импортируем скомпилированный Tailwind CSS вместо CDN
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { WorkshopTracker } from './WorkshopTracker'

// BUILD MARKER — позволяет проверить, что у пользователя свежая версия бандла.
// Если в консоли браузера не видишь этого сообщения — кэш браузера держит старую версию.
const BUILD_TAG = '2026-06-30-05-NUMERIC-UNIVERSAL';
console.log('%c[Vaugold CRM] BUILD: ' + BUILD_TAG + ' (itemToRow + dateFields)', 'background:#0ea5e9;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;')
window.__BUILD_TAG = BUILD_TAG;

// ДИАГНОСТИКА 2026-06-30: видимая плашка с версией билда в углу экрана.
// Если плашки нет — кэш держит старую версию. Hard refresh.
setTimeout(() => {
  try {
    const tag = document.createElement('div');
    tag.id = 'vaugold-build-tag';
    tag.textContent = '🔨 BUILD: ' + BUILD_TAG;
    tag.style.cssText = 'position:fixed;bottom:4px;left:4px;z-index:99999;background:#0ea5e9;color:white;padding:4px 10px;border-radius:6px;font-size:11px;font-family:monospace;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.2);pointer-events:none;';
    document.body.appendChild(tag);
  } catch (e) {}
}, 100);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <WorkshopTracker />
    </AuthProvider>
  </React.StrictMode>,
)