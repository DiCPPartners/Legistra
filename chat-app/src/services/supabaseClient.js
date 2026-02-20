import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.warn('VITE_SUPABASE_URL non è definita. Configura il file .env per abilitare l’autenticazione.')
}

if (!supabaseAnonKey) {
  console.warn('VITE_SUPABASE_ANON_KEY non è definita. Configura il file .env per abilitare l’autenticazione.')
}

// Configurazione Supabase con persistenza della sessione in localStorage
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true, // Salva la sessione in localStorage
    autoRefreshToken: true, // Aggiorna automaticamente il token quando scade
    detectSessionInUrl: true, // Rileva la sessione nell'URL (per OAuth)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined, // Usa localStorage del browser
    storageKey: 'supabase.auth.token', // Chiave per salvare la sessione
  },
})
