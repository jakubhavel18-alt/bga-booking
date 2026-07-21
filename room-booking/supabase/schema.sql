-- ============================================================
-- Rezervace místností — databázové schéma pro Supabase
-- Spusťte celé v Supabase dashboardu: SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;

-- ---------- Typy ----------
do $$ begin
  create type user_role as enum ('viewer', 'booker', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type room_type as enum ('meeting_room', 'space');
exception when duplicate_object then null; end $$;

-- ---------- Profily (1 řádek na přihlášeného uživatele) ----------
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Nový uživatel se přihlásí -> automaticky mu vznikne profil s rolí 'viewer'
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Místnosti / prostory ----------
create table if not exists public.rooms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type room_type not null default 'meeting_room',
  description text,
  capacity int,
  pos_x numeric not null default 50, -- pozice na půdorysu, 0-100 %
  pos_y numeric not null default 50,
  created_at timestamptz not null default now()
);

-- ---------- Rezervace ----------
create table if not exists public.bookings (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text,
  created_at timestamptz not null default now(),
  constraint valid_range check (ends_at > starts_at)
);

-- Databáze sama odmítne dvě překrývající se rezervace stejné místnosti
alter table public.bookings drop constraint if exists no_overlapping_bookings;
alter table public.bookings
  add constraint no_overlapping_bookings
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at) with &&
  );

-- ---------- Pomocná funkce: role přihlášeného uživatele ----------
create or replace function public.current_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.bookings enable row level security;

-- Profily: kdokoli přihlášený vidí seznam lidí (kvůli "kdo rezervoval"), role mění jen admin (přes funkci níže)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() is not null);

-- Místnosti: číst může kdokoli přihlášený, spravovat jen admin
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select using (auth.uid() is not null);

drop policy if exists "rooms_admin_all" on public.rooms;
create policy "rooms_admin_all" on public.rooms
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- Rezervace: číst může kdokoli přihlášený (aby bylo vidět obsazenost)
drop policy if exists "bookings_select" on public.bookings;
create policy "bookings_select" on public.bookings
  for select using (auth.uid() is not null);

-- Vytvořit rezervaci může jen booker/admin, a jen sám za sebe
drop policy if exists "bookings_insert" on public.bookings;
create policy "bookings_insert" on public.bookings
  for insert with check (
    auth.uid() = user_id
    and public.current_role() in ('booker', 'admin')
  );

-- Zrušit rezervaci může její autor, nebo admin za kohokoli
drop policy if exists "bookings_delete" on public.bookings;
create policy "bookings_delete" on public.bookings
  for delete using (
    auth.uid() = user_id or public.current_role() = 'admin'
  );

-- ---------- Funkce pro adminy: změna role uživatele ----------
-- Volá se z appky (Admin sekce), sama si ověří, že volající je admin.
create or replace function public.admin_set_role(target_user_id uuid, new_role user_role)
returns void as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Pouze admin může měnit role.';
  end if;
  update public.profiles set role = new_role where id = target_user_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- Po spuštění tohoto souboru:
-- 1) Přihlaste se do appky svým e-mailem (vznikne vám profil s rolí 'viewer')
-- 2) V Supabase -> SQL Editor spusťte (s vaším e-mailem):
--    update public.profiles set role = 'admin' where email = 'vas@email.cz';
-- 3) Od teď si další role přidělujete přímo v appce v sekci /admin
-- ============================================================
