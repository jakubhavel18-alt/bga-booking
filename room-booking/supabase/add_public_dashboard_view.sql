-- ============================================================
-- Veřejný náhled bez přihlášení: kdokoli s odkazem na appku uvidí Půdorys
-- a Denní přehled (obsazenost + kdo rezervoval), i bez účtu. Vytvořit,
-- zrušit nebo spravovat rezervaci pořád jde jen po přihlášení — appka
-- to sama hlídá v UI a databáze to navíc vynucuje ostatními politikami
-- níž (ty se touhle migrací nemění).
--
-- Spusťte v Supabase -> SQL Editor, jednou, na existujícím projektu.
-- ============================================================

-- Místnosti: číst může kdokoli, i bez přihlášení.
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select using (true);

-- Rezervace: číst může kdokoli, i bez přihlášení (kvůli obsazenosti).
drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings
  for select using (true);

-- Profily: přihlášení uživatelé vidí všechny (jako doteď — appka to
-- potřebuje pro Správu a pro zobrazení "kdo rezervoval"). Bez přihlášení
-- je veřejně vidět jen jméno/e-mail u lidí, kteří mají aspoň jednu
-- rezervaci — ne úplný seznam všech založených účtů v appce.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() is not null
    or exists (
      select 1 from public.bookings b where b.user_id = profiles.id
    )
  );
