import { createClient } from '@supabase/supabase-js';
import { getStoredConfig } from '../services/config';

export function getSupabaseClient() {
  const { supabaseUrl, supabaseKey } = getStoredConfig();
  const isConfigured = Boolean(
    supabaseUrl && 
    supabaseKey && 
    !supabaseUrl.includes('tu-proyecto') &&
    supabaseUrl.startsWith('https://')
  );

  return {
    client: isConfigured ? createClient(supabaseUrl, supabaseKey) : null,
    isConfigured
  };
}

const initial = getSupabaseClient();
export const supabase = initial.client;
export const isSupabaseConfigured = initial.isConfigured;
