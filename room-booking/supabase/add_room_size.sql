-- ============================================================
-- Umožní místnostem mít na půdorysu skutečnou velikost (šířku a výšku),
-- ne jen jeden bod. Spusťte JEDNOU v Supabase: SQL Editor -> New query -> Run.
--
-- pos_w / pos_h: v % šířky/výšky obrázku, NULL = appka dál ukáže starou
-- malou kartičku na jednom bodě (dokud místnost na Půdorysu — rozmístění
-- neroztáhnete úchytem v pravém dolním rohu do reálné velikosti).
-- ============================================================

alter table public.rooms add column if not exists pos_w numeric;
alter table public.rooms add column if not exists pos_h numeric;
