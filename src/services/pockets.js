/**
 * Servicio de almacenamiento para Bolsillos
 * Sincroniza con Supabase si está autenticado, o con localStorage de forma transparente.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'platicapp_pockets_real_v1';

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

export const DEFAULT_POCKETS = [];

export async function resetAllUserDataAndCloud() {
  // 1. Borrar en Supabase si está conectado
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pockets').delete().eq('user_id', user.id);
        await supabase.from('incomes').delete().eq('user_id', user.id);
        await supabase.from('expenses').delete().eq('user_id', user.id);
        await supabase.from('transfers').delete().eq('user_id', user.id);
      } else {
        await supabase.from('pockets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
    } catch (e) {
      console.warn('Error al limpiar Supabase:', e);
    }
  }

  // 2. Limpiar todo en localStorage preservando credenciales
  if (typeof window !== 'undefined' && window.localStorage) {
    const preserveKeys = {
      'platicapp_supabase_url': localStorage.getItem('platicapp_supabase_url'),
      'platicapp_supabase_key': localStorage.getItem('platicapp_supabase_key'),
      'platicapp_groq_key': localStorage.getItem('platicapp_groq_key'),
      'platicapp_gemini_key': localStorage.getItem('platicapp_gemini_key'),
      'platicapp_ai_provider': localStorage.getItem('platicapp_ai_provider'),
      'platicapp_currency': localStorage.getItem('platicapp_currency')
    };

    localStorage.clear();

    Object.entries(preserveKeys).forEach(([k, v]) => {
      if (v) localStorage.setItem(k, v);
    });

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem('platicapp_history_real_v1', JSON.stringify([]));
  }

  return [];
}

export function clearAllLocalUserData() {
  return resetAllUserDataAndCloud();
}

export async function fetchPockets() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('pockets')
          .select('*')
          .order('created_at', { ascending: true });

        if (!error && data) {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
          return data;
        }
      }
    } catch (e) {
      console.warn('Supabase no disponible o no autenticado:', e);
    }
  }

  const local = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Ignorar
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
  return [];
}

export async function savePocketsBatch(pocketsList) {
  // Asegurar que cada bolsillo tenga un id con formato UUID y atributos de perfil/porcentaje
  const sanitized = pocketsList.map(p => ({
    ...p,
    id: (p.id && p.id.length === 36 && p.id.includes('-')) ? p.id : generateUUID(),
    perfil: p.perfil || 'personal',
    porcentaje_objetivo: (p.porcentaje_objetivo !== undefined && p.porcentaje_objetivo !== '' && p.porcentaje_objetivo !== null) 
      ? Number(p.porcentaje_objetivo) 
      : null
  }));

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sanitized));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const payload = sanitized.map(p => ({
          ...p,
          user_id: user.id
        }));
        await supabase.from('pockets').upsert(payload);
      }
    } catch (e) {
      console.warn('Error al guardar bolsillos en Supabase:', e);
    }
  }
  return sanitized;
}

export async function savePocket(pocket) {
  const current = await fetchPockets();
  let updated;

  const validId = (pocket.id && pocket.id.length === 36 && pocket.id.includes('-')) 
    ? pocket.id 
    : generateUUID();

  const exists = current.some(p => p.id === pocket.id);
  if (exists) {
    updated = current.map(p => p.id === pocket.id ? { ...p, ...pocket, id: validId } : p);
  } else {
    updated = [...current, { ...pocket, id: validId }];
  }

  return await savePocketsBatch(updated);
}

export async function deletePocket(pocketId) {
  const current = await fetchPockets();
  const updated = current.filter(p => p.id !== pocketId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('pockets').delete().eq('id', pocketId);
      }
    } catch (e) {
      console.warn('Error al borrar en Supabase:', e);
    }
  }

  return updated;
}
