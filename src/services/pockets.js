/**
 * Servicio de almacenamiento para Bolsillos
 * Sincroniza con Supabase si está autenticado, o con localStorage de forma transparente.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'platicapp_pockets_v4';

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

export const DEFAULT_POCKETS = [
  { 
    id: 'a0000000-0000-4000-8000-000000000001', 
    nombre: 'Arriendo', 
    color: '#EF4444', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 1200000, 
    dia_vencimiento: 30,
    dia_vencimiento_2: null,
    saldo_actual: 450000,
    cuenta_destino: 'Bancolombia',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  },
  { 
    id: 'a0000000-0000-4000-8000-000000000002', 
    nombre: 'YouTube & Suscripciones', 
    color: '#F59E0B', 
    tipo: 'compromiso_fijo', 
    periodicidad: 'mensual',
    meta_monto: 45000, 
    dia_vencimiento: 12,
    dia_vencimiento_2: null,
    saldo_actual: 45000,
    cuenta_destino: 'Tarjeta Virtual',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  },
  { 
    id: 'a0000000-0000-4000-8000-000000000003', 
    nombre: 'Gasolina & Transporte', 
    color: '#06B6D4', 
    tipo: 'gasto_corriente', 
    periodicidad: 'quincenal',
    meta_monto: 240000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: 30,
    saldo_actual: 120000,
    cuenta_destino: 'Nequi',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  },
  { 
    id: 'a0000000-0000-4000-8000-000000000004', 
    nombre: 'Mercado', 
    color: '#10B981', 
    tipo: 'gasto_corriente', 
    periodicidad: 'quincenal',
    meta_monto: 600000, 
    dia_vencimiento: 15,
    dia_vencimiento_2: 30,
    saldo_actual: 220000,
    cuenta_destino: 'Daviplata',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  },
  { 
    id: 'a0000000-0000-4000-8000-000000000005', 
    nombre: 'Reserva & Colchón', 
    color: '#3B82F6', 
    tipo: 'reserva', 
    periodicidad: 'libre',
    meta_monto: 2000000, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 850000,
    cuenta_destino: 'Bancolombia',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  },
  { 
    id: 'a0000000-0000-4000-8000-000000000006', 
    nombre: 'Libre / Ocio', 
    color: '#8B5CF6', 
    tipo: 'libre', 
    periodicidad: 'libre',
    meta_monto: null, 
    dia_vencimiento: null,
    dia_vencimiento_2: null,
    saldo_actual: 155000,
    cuenta_destino: 'Efectivo',
    pagado_este_ciclo: false,
    deuda_interna: null,
    es_compartido: false
  }
];

export async function fetchPockets() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('pockets')
          .select('*')
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignorar
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_POCKETS));
  return DEFAULT_POCKETS;
}

export async function savePocketsBatch(pocketsList) {
  // Asegurar que cada bolsillo tenga un id con formato UUID
  const sanitized = pocketsList.map(p => ({
    ...p,
    id: (p.id && p.id.length === 36 && p.id.includes('-')) ? p.id : generateUUID()
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
