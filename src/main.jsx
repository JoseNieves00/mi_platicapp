import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

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
