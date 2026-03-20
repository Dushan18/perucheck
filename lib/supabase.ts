import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isWeb = Platform.OS === 'web';
const isServer = typeof window === 'undefined' && !isWeb;

export const supabase: SupabaseClient | null =
  !isServer && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // En web usamos storage por defecto (localStorage); en native usamos AsyncStorage.
          storage: isWeb ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: isWeb,
          flowType: isWeb ? 'implicit' : 'pkce',
        },
      })
    : null;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
