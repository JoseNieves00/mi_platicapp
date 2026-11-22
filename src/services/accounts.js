/**
 * Servicio de almacenamiento para Cuentas Bancarias Reales
 * Sincroniza con localStorage y Supabase.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_ACCOUNTS_KEY = 'platicapp_accounts_v1';

export const DEFAULT_ACCOUNTS = [
  { id: 'acc-bancolombia', nombre: 'Bancolombia', tipo: 'banco', color: '#F59E0B' },
  { id: 'acc-nequi', nombre: 'Nequi', tipo: 'billetera', color: '#8B5CF6' },
  { id: 'acc-daviplata', nombre: 'Daviplata', tipo: 'billetera', color: '#EF4444' },
  { id: 'acc-virtual', nombre: 'Tarjeta Virtual', tipo: 'tarjeta', color: '#06B6D4' },
  { id: 'acc-efectivo', nombre: 'Efectivo', tipo: 'efectivo', color: '#10B981' }
];

export async function fetchAccounts() {
  const local = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch {
      // Ignorar
    }
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
  return DEFAULT_ACCOUNTS;
}

export async function saveAccount(account) {
  const current = await fetchAccounts();
  let updated;

  const exists = current.some(a => a.id === account.id || a.nombre.toLowerCase() === account.nombre.toLowerCase());
  if (exists) {
    updated = current.map(a => (a.id === account.id || a.nombre.toLowerCase() === account.nombre.toLowerCase()) ? { ...a, ...account } : a);
  } else {
    updated = [...current, { ...account, id: account.id || `acc-${Date.now()}` }];
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteAccount(accountId) {
  const current = await fetchAccounts();
  const updated = current.filter(a => a.id !== accountId);
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(updated));
  return updated;
}
