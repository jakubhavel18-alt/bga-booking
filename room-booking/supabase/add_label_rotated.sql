-- ============================================================
-- Umožní otočit popisek místnosti na půdorysu o 90° (pro úzké/vysoké
-- místnosti, kde se text "naležato" lépe vejde). Spusťte JEDNOU v
-- Supabase: SQL Editor -> New query -> Run.
-- ============================================================

alter table public.rooms add column if not exists label_rotated boolean not null default false;
