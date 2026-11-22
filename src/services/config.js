/**
 * Configuración dinámica de credenciales (Soporta .env y configuración desde la UI de Ajustes)
 */

export function getStoredConfig() {
  const localSupabaseUrl = localStorage.getItem('platicapp_supabase_url');
  const localSupabaseKey = localStorage.getItem('platicapp_supabase_key');
  const localGroqKey = localStorage.getItem('platicapp_groq_key');
  const localGeminiKey = localStorage.getItem('platicapp_gemini_key');
  const localAiProvider = localStorage.getItem('platicapp_ai_provider') || 'groq';

  return {
    supabaseUrl: localSupabaseUrl || import.meta.env.VITE_SUPABASE_URL || '',
    supabaseKey: localSupabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    groqKey: localGroqKey || import.meta.env.VITE_GROQ_API_KEY || '',
    geminiKey: localGeminiKey || import.meta.env.VITE_GEMINI_API_KEY || '',
    aiProvider: localAiProvider
  };
}

export function saveStoredConfig(newConfig) {
  if (newConfig.supabaseUrl !== undefined) localStorage.setItem('platicapp_supabase_url', newConfig.supabaseUrl);
  if (newConfig.supabaseKey !== undefined) localStorage.setItem('platicapp_supabase_key', newConfig.supabaseKey);
  if (newConfig.groqKey !== undefined) localStorage.setItem('platicapp_groq_key', newConfig.groqKey);
  if (newConfig.geminiKey !== undefined) localStorage.setItem('platicapp_gemini_key', newConfig.geminiKey);
  if (newConfig.aiProvider !== undefined) localStorage.setItem('platicapp_ai_provider', newConfig.aiProvider);
}
