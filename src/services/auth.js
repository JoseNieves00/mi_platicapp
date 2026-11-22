/**
 * Servicio de Autenticación con Supabase (Google OAuth)
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export async function signInWithGoogle() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no está configurado. Por favor ingresa tu URL y Clave Anónima en Ajustes.');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      }
    }
  });

  if (error) {
    console.error('Error al iniciar sesión con Google:', error);
    throw error;
  }

  return data;
}

export async function signOutUser() {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error al cerrar sesión:', error);
    throw error;
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.warn('No se pudo obtener el usuario actual:', err);
    return null;
  }
}

export function subscribeToAuthChanges(callback) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null, event);
  });
}
