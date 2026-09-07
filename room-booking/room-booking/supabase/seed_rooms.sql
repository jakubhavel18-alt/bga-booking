-- ============================================================
-- Přednastavené místnosti — dočasné rozmístění, než uděláte
-- vlastní přesné podle reality. Spusťte v Supabase SQL Editoru
-- JEDNOU, po schema.sql. Je bezpečné spustit i vícekrát —
-- místnost se stejným názvem se podruhé nepřidá.
--
-- Layout (pos_x/pos_y v %, 0/0 = vlevo nahoře):
--   horní řada = velký sál, 2 zasedačky, 5 cowork míst
--   dolní řada = 2 zasedačky
--
-- Kdykoli později přejmenujte, přesuňte (pos_x/pos_y) nebo smažte
-- ve Správě.
-- ============================================================

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Velký sál', 'meeting_room', 30, 7, 15, 'Velký prostor, akce a prezentace'
where not exists (select 1 from public.rooms where name = 'Velký sál');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Zasedačka Alfa', 'meeting_room', 8, 19, 15, null
where not exists (select 1 from public.rooms where name = 'Zasedačka Alfa');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Zasedačka Beta', 'meeting_room', 6, 32, 15, null
where not exists (select 1 from public.rooms where name = 'Zasedačka Beta');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Cowork 1', 'space', 1, 44, 15, null
where not exists (select 1 from public.rooms where name = 'Cowork 1');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Cowork 2', 'space', 1, 56, 15, null
where not exists (select 1 from public.rooms where name = 'Cowork 2');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Cowork 3', 'space', 1, 68, 15, null
where not exists (select 1 from public.rooms where name = 'Cowork 3');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Cowork 4', 'space', 1, 81, 15, null
where not exists (select 1 from public.rooms where name = 'Cowork 4');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Cowork 5', 'space', 1, 93, 15, null
where not exists (select 1 from public.rooms where name = 'Cowork 5');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Zasedačka Gama', 'meeting_room', 6, 35, 85, null
where not exists (select 1 from public.rooms where name = 'Zasedačka Gama');

insert into public.rooms (name, type, capacity, pos_x, pos_y, description)
select 'Zasedačka Delta', 'meeting_room', 6, 65, 85, null
where not exists (select 1 from public.rooms where name = 'Zasedačka Delta');
