/**
 * Servicio de almacenamiento para Bolsillos
 * Sincroniza con Supabase si está configurado, o con localStorage de forma transparente.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'platicapp_pockets_v1';

// Plantilla inicial limpia (solo si el usuario no tiene nada guardado)
export const DEFAULT_POCKETS = [
  { 
    id: 'p-arriendo', 
    nombre: 'Arriendo / Vivienda', 
    color: '#EF4444', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 1200000, 
    dia_vencimiento: 30,
    dia_vencimiento_2: null,
    saldo_actual: 0 
  },
  { 
    id: 'p-servicios', 
    nombre: 'Servicios Públicos', 
    color: '#F59E0B', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 250000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: null,
    saldo_actual: 0 
  },
  { 
    id: 'p-comida', 
    nombre: 'Mercado & Comida', 
    color: '#10B981', 
    tipo: 'gasto_corriente', 
    periodicidad: 'quincenal',
    meta_monto: 350000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: 30,
    saldo_actual: 0 
  },
  { 
    id: 'p-reserva', 
    nombre: 'Colchón de Reserva', 
    color: '#3B82F6', 
    tipo: 'reserva', 
    periodicidad: 'libre',
    meta_monto: 2000000, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 0 
  },
  { 
    id: 'p-libre', 
    nombre: 'Libre / Ocio', 
    color: '#8B5CF6', 
    tipo: 'libre', 
    periodicidad: 'libre',
    meta_monto: null, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 0 
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
      console.warn('Fallo al consultar Supabase, usando almacenamiento local:', e);
    }
  }

  // Fallback local
  const local = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch {
      // Ignorar error de parseo
    }
  }

  // Guardar por defecto si está vacío
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_POCKETS));
  return DEFAULT_POCKETS;
}

export async function savePocket(pocket) {
  // 1. Guardar localmente
  const current = await fetchPockets();
  let updated;

  const exists = current.some(p => p.id === pocket.id);
  if (exists) {
    updated = current.map(p => p.id === pocket.id ? { ...p, ...pocket } : p);
  } else {
    updated = [...current, { ...pocket, id: pocket.id || `p-${Date.now()}` }];
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

  // 2. Sincronizar con Supabase si está disponible
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('pockets').upsert([pocket]);
    } catch (e) {
      console.warn('No se pudo sincronizar en Supabase:', e);
    }
  }

  return updated;
}

export async function deletePocket(pocketId) {
  const current = await fetchPockets();
  const updated = current.filter(p => p.id !== pocketId);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('pockets').delete().eq('id', pocketId);
    } catch (e) {
      console.warn('No se pudo borrar en Supabase:', e);
    }
  }

  return updated;
}

export async function updatePocketBalance(pocketId, deltaAmount) {
  const current = await fetchPockets();
  const updated = current.map(p => {
    if (p.id === pocketId) {
      return {
        ...p,
        saldo_actual: Math.max(0, Number(p.saldo_actual || 0) + deltaAmount)
      };
    }
    return p;
  });

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
