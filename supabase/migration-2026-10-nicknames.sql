-- FuelScan: nadimci stanica - pokrenuti JEDNOM u Supabase -> SQL Editor (idempotentno).
--
-- Nadimak važi za STANICU, ne za pojedinačan račun: ključ je normalizovan
-- naziv + adresa stanice (isti ključ koji aplikacija koristi za grupisanje na
-- ekranu Stanice), pa ga dobijaju svi računi te stanice, i budući.
-- `user_id` je `text`, kao u `fuel_receipts`.

create table if not exists public.station_nicknames (
  user_id     text        not null default auth.uid()::text,
  station_key text        not null,
  nickname    text        not null check (length(trim(nickname)) between 1 and 60),
  updated_at  timestamptz not null default now(),
  primary key (user_id, station_key)
);

alter table public.station_nicknames enable row level security;

drop policy if exists "own nicknames select" on public.station_nicknames;
drop policy if exists "own nicknames insert" on public.station_nicknames;
drop policy if exists "own nicknames update" on public.station_nicknames;
drop policy if exists "own nicknames delete" on public.station_nicknames;

create policy "own nicknames select" on public.station_nicknames
  for select using (user_id = auth.uid()::text);
create policy "own nicknames insert" on public.station_nicknames
  for insert with check (user_id = auth.uid()::text);
create policy "own nicknames update" on public.station_nicknames
  for update using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "own nicknames delete" on public.station_nicknames
  for delete using (user_id = auth.uid()::text);
