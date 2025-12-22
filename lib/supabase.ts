import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isServer = typeof window === 'undefined';
const isWeb = typeof window !== 'undefined';

export const supabase: SupabaseClient | null =
  !isServer && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // En web usamos storage por defecto (localStorage); en native usamos AsyncStorage.
          storage: isWeb ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: isWeb,
        },
      })
    : null;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
