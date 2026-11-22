/**
 * Servicio de almacenamiento para Bolsillos
 * Sincroniza con Supabase si está configurado, o con localStorage de forma transparente.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'platicapp_pockets_v2';

export const DEFAULT_POCKETS = [
  { 
    id: 'p-arriendo', 
    nombre: 'Arriendo', 
    color: '#EF4444', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 1200000, 
    dia_vencimiento: 30,
    dia_vencimiento_2: null,
    saldo_actual: 450000,
    deuda_interna: null // { pocket_id, monto }
  },
  { 
    id: 'p-servicios', 
    nombre: 'Servicios', 
    color: '#F59E0B', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 250000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: null,
    saldo_actual: 180000,
    deuda_interna: null
  },
  { 
    id: 'p-comida', 
    nombre: 'Mercado', 
    color: '#10B981', 
    tipo: 'gasto_corriente', 
    periodicidad: 'quincenal',
    meta_monto: 600000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: 30,
    saldo_actual: 220000,
    deuda_interna: null
  },
  { 
    id: 'p-reserva', 
    nombre: 'Reserva', 
    color: '#3B82F6', 
    tipo: 'reserva', 
    periodicidad: 'libre',
    meta_monto: 2000000, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 850000,
    deuda_interna: null
  },
  { 
    id: 'p-libre', 
    nombre: 'Libre', 
    color: '#8B5CF6', 
    tipo: 'libre', 
    periodicidad: 'libre',
    meta_monto: null, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 140000,
    deuda_interna: null
  }
];

export async function fetchPockets() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('pockets')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('Supabase no disponible, usando almacenamiento local:', e);
    }
  }

  const local = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch {
      // Ignorar
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_POCKETS));
  return DEFAULT_POCKETS;
}

export async function savePocketsBatch(pocketsList) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(pocketsList));
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('pockets').upsert(pocketsList);
    } catch (e) {
      console.warn('Error al guardar en Supabase:', e);
    }
  }
  return pocketsList;
}

export async function savePocket(pocket) {
  const current = await fetchPockets();
  let updated;

  const exists = current.some(p => p.id === pocket.id);
  if (exists) {
    updated = current.map(p => p.id === pocket.id ? { ...p, ...pocket } : p);
  } else {
    updated = [...current, { ...pocket, id: pocket.id || `p-${Date.now()}` }];
  }

  return await savePocketsBatch(updated);
}

export async function deletePocket(pocketId) {
  const current = await fetchPockets();
  const updated = current.filter(p => p.id !== pocketId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('pockets').delete().eq('id', pocketId);
    } catch (e) {
      console.warn('Error al borrar en Supabase:', e);
    }
  }

  return updated;
}
