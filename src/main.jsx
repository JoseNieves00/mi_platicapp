import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registro de actualización automática de Service Worker (PWA)
// Verifica inmediatamente al abrir y cada vez que el dispositivo se conecta a WiFi / Red
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Aplica la nueva versión de inmediato
    updateSW(true);
  },
  onOfflineReady() {
    console.log('MI Platicapp lista para funcionar sin conexión.');
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;

    // 1. Verificar cada vez que se recupera conexión a Internet (WiFi / Datos)
    window.addEventListener('online', () => {
      console.log('Conexión reestablecida. Verificando actualizaciones...');
      registration.update();
    });

    // 2. Verificar cuando el usuario vuelve a enfocar la app (ej. abrir desde marcador o multitarea)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registration.update();
      }
    });

    // 3. Chequeo periódico cada 15 minutos en segundo plano si hay red
    setInterval(() => {
      if (navigator.onLine) {
        registration.update();
      }
    }, 15 * 60 * 1000);
  }
});

// Limpieza automática de datos de prueba almacenados previamente en el navegador
const RESET_KEY = 'platicapp_fresh_start_v2';
if (typeof window !== 'undefined' && !localStorage.getItem(RESET_KEY)) {
  const keysToRemove = [
    'platicapp_pockets_real_v1',
    'platicapp_pockets_v4',
    'platicapp_pockets_v3',
    'platicapp_pockets_v2',
    'platicapp_pockets_v1',
    'platicapp_history_real_v1',
    'platicapp_history_v3',
    'platicapp_history_v2',
    'platicapp_history_v1',
  ];
  keysToRemove.forEach(k => localStorage.removeItem(k));
  localStorage.setItem('platicapp_pockets_real_v1', JSON.stringify([]));
  localStorage.setItem('platicapp_history_real_v1', JSON.stringify([]));
  localStorage.setItem(RESET_KEY, 'true');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
