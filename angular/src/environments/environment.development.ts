/**
 * Development konfiguracija (`ng serve`). Za lokalni proxy (`npx wrangler dev`) promeni `corsProxyUrl`.
 *
 * Supabase anon ključ je javan po dizajnu (ide u browser) - bezbednost podataka
 * obezbeđuje Row Level Security u bazi (vidi `supabase/migration-2026-10.sql`).
 */
export const environment = {
  production: false,
  supabaseUrl: 'https://jybatqpvokssutompyto.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5YmF0cXB2b2tzc3V0b21weXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTUwMjIsImV4cCI6MjA5NjU5MTAyMn0.W-zZN3dLJDn18m3qoL0EP8s4g2K32vFO7tyIWD-oN_Q',
  corsProxyUrl: 'https://fuelscan-proxy.fuelscan.workers.dev/?url=',
};
