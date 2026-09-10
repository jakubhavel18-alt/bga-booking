-- ============================================================
-- Doplní chybějící UPDATE právo (RLS policy) pro rezervace.
-- Spusťte JEDNOU v Supabase: SQL Editor -> New query -> Run.
--
-- Appka odjakživa uměla rezervaci upravit (posunout čas, přetáhnout do
-- jiné místnosti) jen v prohlížeči — databáze na to chybějící právo
-- neměla, takže se úprava vždycky potichu neuložila a po přenačtení dat
-- se to vrátilo do původního stavu. Tenhle skript to doplní.
-- ============================================================

drop policy if exists "bookings_update" on public.bookings;
create policy "bookings_update" on public.bookings
  for update using (
    auth.uid() = user_id or public.current_role() = 'admin'
  )
  with check (
    auth.uid() = user_id or public.current_role() = 'admin'
  );
