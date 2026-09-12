-- ============================================================
-- Umožní označit místnost/stůl jako trvale obsazené (fixní místo pro
-- konkrétního člověka/firmu), bez zakládání rezervace v kalendáři.
-- Spusťte JEDNOU v Supabase: SQL Editor -> New query -> Run.
--
-- permanent_occupant: jméno/firma jako prostý text, NULL/prázdné = místo
-- je normálně volné k rezervaci jako dřív. Appka pak přes tuhle místnost
-- nedovolí založit novou rezervaci, dokud pole ve Správě zase nevyprázdníte.
-- ============================================================

alter table public.rooms add column if not exists permanent_occupant text;
