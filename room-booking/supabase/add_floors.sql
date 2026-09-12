-- ============================================================
-- Přidá patra (Přízemí / 1. patro / 2. patro) k místnostem a popiskům
-- na půdorysu. Spusťte JEDNOU v Supabase: SQL Editor -> New query -> Run.
--
-- floor: 0 = Přízemí, 1 = 1. patro, 2 = 2. patro, NULL = nezařazeno
-- (appka místnost/popisek dál ukáže v seznamech, jen ne na žádném
-- konkrétním půdorysu, dokud mu patro nenastavíte ve Správě).
-- ============================================================

alter table public.rooms add column if not exists floor smallint;
alter table public.floorplan_labels add column if not exists floor smallint;
