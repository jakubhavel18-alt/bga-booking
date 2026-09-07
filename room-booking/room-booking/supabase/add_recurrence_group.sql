-- ============================================================
-- Zrušit celou sérii opakované rezervace jedním klikem
-- Spusťte jednou v Supabase -> SQL Editor -> New query -> Run
-- (Na NOVÉM projektu tohle appka umí rovnou, je to součástí schema.sql.)
-- ============================================================

-- Sdílené UUID pro všechny termíny jedné opakované rezervace (appka ho
-- vygeneruje při vytvoření série). NULL u jednorázové rezervace.
alter table public.bookings
  add column if not exists recurrence_group_id uuid;

-- Rychlé mazání/hledání celé série podle jejího recurrence_group_id.
create index if not exists bookings_recurrence_group_id_idx
  on public.bookings (recurrence_group_id);
