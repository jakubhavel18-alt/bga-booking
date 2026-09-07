-- ============================================================
-- Popisky na půdorysu (text bez rezervace, např. "Recepce", "Kuchyňka")
-- + drag-and-drop editor rozmístění ve Správě
-- Spusťte jednou v Supabase -> SQL Editor -> New query -> Run
-- (Na NOVÉM projektu tohle appka umí rovnou, je to součástí schema.sql.)
-- ============================================================

create table if not exists public.floorplan_labels (
  id uuid primary key default uuid_generate_v4(),
  text text not null,
  pos_x numeric not null default 50, -- pozice na půdorysu, 0-100 %
  pos_y numeric not null default 50,
  created_at timestamptz not null default now()
);

alter table public.floorplan_labels enable row level security;

-- Náhled popisků je veřejný, i bez přihlášení (jsou i na veřejném Půdorysu).
drop policy if exists "floorplan_labels_select" on public.floorplan_labels;
create policy "floorplan_labels_select" on public.floorplan_labels
  for select using (true);

drop policy if exists "floorplan_labels_admin_all" on public.floorplan_labels;
create policy "floorplan_labels_admin_all" on public.floorplan_labels
  for all using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');
