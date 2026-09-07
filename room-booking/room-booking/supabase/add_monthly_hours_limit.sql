-- ============================================================
-- Měsíční hodinový limit podle smlouvy (měkký limit k evidenci a
-- případnému doúčtování — appka nikdy nikomu rezervaci nezablokuje).
-- Spusťte v Supabase -> SQL Editor, jednou, na existujícím projektu.
-- ============================================================

alter table public.profiles
  add column if not exists monthly_hours_limit numeric;

-- Nastavení limitu voláme z appky (sekce Správa -> Lidé a práva),
-- funkce si sama ověří, že volající je admin.
create or replace function public.admin_set_hours_limit(target_user_id uuid, new_limit numeric)
returns void as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Pouze admin může měnit limit hodin.';
  end if;
  update public.profiles set monthly_hours_limit = new_limit where id = target_user_id;
end;
$$ language plpgsql security definer;
