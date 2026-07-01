import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/app-config';

/**
 * Singleton Supabase klijent - ekvivalent `old-vanilla/js/auth.js`
 * (`window.supabase.createClient(...)`), samo uvezen kao pravi ES modul
 * umesto globalnog `<script>` taga, i tipiziran.
 */
export const supabaseClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
