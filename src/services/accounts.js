/**
 * Servicio de almacenamiento para Cuentas Bancarias Reales
 * Sincroniza con localStorage y Supabase.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_ACCOUNTS_KEY = 'platicapp_accounts_v2';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const DEFAULT_ACCOUNTS = [
  { id: 'b0000000-0000-4000-8000-000000000001', nombre: 'Bancolombia', tipo: 'banco', color: '#F59E0B' },
  { id: 'b0000000-0000-4000-8000-000000000002', nombre: 'Nequi', tipo: 'billetera', color: '#8B5CF6' },
  { id: 'b0000000-0000-4000-8000-000000000003', nombre: 'Daviplata', tipo: 'billetera', color: '#EF4444' },
  { id: 'b0000000-0000-4000-8000-000000000004', nombre: 'Tarjeta Virtual', tipo: 'tarjeta', color: '#06B6D4' },
  { id: 'b0000000-0000-4000-8000-000000000005', nombre: 'Efectivo', tipo: 'efectivo', color: '#10B981' }
];

export async function fetchAccounts() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(data));
          return data;
        }
      }
    } catch (e) {
      console.warn('Supabase no disponible para cuentas:', e);
    }
  }

  const local = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignorar
    }
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS));
  return DEFAULT_ACCOUNTS;
}

export async function saveAccount(account) {
  const current = await fetchAccounts();
  const validId = (account.id && account.id.length === 36 && account.id.includes('-')) 
    ? account.id 
    : generateUUID();

  const sanitizedAccount = {
    ...account,
    id: validId,
    perfil: account.perfil || 'personal'
  };

  const exists = current.some(a => a.id === account.id || a.nombre.toLowerCase() === account.nombre.toLowerCase());
  if (exists) {
    updated = current.map(a => (a.id === account.id || a.nombre.toLowerCase() === account.nombre.toLowerCase()) 
      ? { ...a, ...sanitizedAccount, id: a.id || validId } 
      : a
    );
  } else {
    updated = [...current, sanitizedAccount];
  }

  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('accounts').upsert({
          id: validId,
          nombre: account.nombre,
          tipo: account.tipo || 'banco',
          color: account.color || '#3B82F6',
          perfil: account.perfil || 'personal',
          user_id: user.id
        });
      }
    } catch (e) {
      console.warn('Error al guardar cuenta en Supabase:', e);
    }
  }

  return updated;
}

export async function deleteAccount(accountId) {
  const current = await fetchAccounts();
  const updated = current.filter(a => a.id !== accountId);
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('accounts').delete().eq('id', accountId);
      }
    } catch (e) {
      console.warn('Error al borrar cuenta en Supabase:', e);
    }
  }

  return updated;
}
