-- ============================================================
-- Skupiny místností — omezit, jaké místnosti/prostory daný uživatel vidí
-- (např. "Fixní místo" = jen zasedačky + Velký sál, bez ostatního coworku)
-- Spusťte jednou v Supabase -> SQL Editor -> New query -> Run
-- (Na NOVÉM projektu tohle appka umí rovnou, je to součástí schema.sql.)
-- ============================================================

create table if not exists public.room_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Které místnosti/prostory patří do dané skupiny (co uvidí lidé v ní).
create table if not exists public.room_group_rooms (
  group_id uuid not null references public.room_groups(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  primary key (group_id, room_id)
);

-- NULL = bez omezení (vidí vše, jako dosud).
alter table public.profiles
  add column if not exists room_group_id uuid references public.room_groups(id) on delete set null;

alter table public.room_groups enable row level security;
alter table public.room_group_rooms enable row level security;

-- Náhled skupin je veřejný (appka podle nich filtruje, co komu ukázat) —
-- žádná citlivá data v tom nejsou, jen názvy skupin a přiřazení místností.
drop policy if exists "room_groups_select" on public.room_groups;
create policy "room_groups_select" on public.room_groups
  for select using (true);

drop policy if exists "room_group_rooms_select" on public.room_group_rooms;
create policy "room_group_rooms_select" on public.room_group_rooms
  for select using (true);

drop policy if exists "room_groups_admin_all" on public.room_groups;
create policy "room_groups_admin_all" on public.room_groups
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "room_group_rooms_admin_all" on public.room_group_rooms;
create policy "room_group_rooms_admin_all" on public.room_group_rooms
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- Nastavení skupiny uživateli — volá se ze Správy, sama ověří, že volající je admin.
create or replace function public.admin_set_room_group(target_user_id uuid, new_group_id uuid)
returns void as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Pouze admin může měnit skupinu místností.';
  end if;
  update public.profiles set room_group_id = new_group_id where id = target_user_id;
end;
$$ language plpgsql security definer;
