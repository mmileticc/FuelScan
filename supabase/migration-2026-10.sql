-- FuelScan migracija (oktobar 2026) - pokrenuti JEDNOM u Supabase -> SQL Editor.
-- Bezbedno je pokrenuti i više puta (idempotentno).
--
-- Kolona `user_id` je tipa `text`, a `auth.uid()` vraća `uuid` - zato se svuda
-- poredi sa `auth.uid()::text`.

-- 1) Nove kolone
alter table public.fuel_receipts add column if not exists odometer_km integer;
alter table public.fuel_receipts add column if not exists invoice_number text;

-- 2) Isti fiskalni račun ne može dva puta kod istog korisnika.
--    Stari zapisi nemaju invoice_number (NULL) i ne smetaju indeksu; ručni unosi takođe.
create unique index if not exists fuel_receipts_user_invoice_uniq
  on public.fuel_receipts (user_id, invoice_number)
  where invoice_number is not null;

alter table public.fuel_receipts alter column user_id set default auth.uid()::text;

-- 3) Row Level Security: svaki korisnik vidi i menja SAMO svoje redove.
--    Anon ključ je javan (nalazi se u aplikaciji), pa je RLS jedina zaštita podataka.
alter table public.fuel_receipts enable row level security;

drop policy if exists "own rows select" on public.fuel_receipts;
drop policy if exists "own rows insert" on public.fuel_receipts;
drop policy if exists "own rows update" on public.fuel_receipts;
drop policy if exists "own rows delete" on public.fuel_receipts;

create policy "own rows select" on public.fuel_receipts
  for select using (user_id = auth.uid()::text);
create policy "own rows insert" on public.fuel_receipts
  for insert with check (user_id = auth.uid()::text);
create policy "own rows update" on public.fuel_receipts
  for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "own rows delete" on public.fuel_receipts
  for delete using (user_id = auth.uid()::text);

-- 4) Provera: lista SVIH politika na tabeli. Ako postoji neka STARA politika
--    (drugog imena) čiji je uslov `true`, obriši je - permisivne politike se
--    OR-uju, pa bi ona i dalje otvarala tuđe podatke.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'fuel_receipts';
