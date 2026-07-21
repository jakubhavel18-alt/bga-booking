# Rezervace místností

Webová appka na rezervaci 6–15 místností a prostor: jednoduchý půdorys,
3 úrovně přístupu (admin / rezervující / jen náhled) a přihlášení e-mailem —
funguje pro kohokoli, bez Microsoft nebo Google účtu.

Běží zdarma na **Vercelu** (hosting appky) + **Supabase** (databáze a přihlašování).

---

## Než začnete

Budete potřebovat tři účty, všechny zdarma, nic se neplatí kartou:

1. **GitHub** — https://github.com/signup
2. **Supabase** — https://supabase.com (přihlaste se přes GitHub, je to nejrychlejší)
3. **Vercel** — https://vercel.com (taky se dá přihlásit přes GitHub)

Založte si je v tomto pořadí — GitHub jako první, protože přes něj se pak
přihlásíte i do zbylých dvou.

---

## Krok 1 — Založit databázi v Supabase

1. Na https://supabase.com klikněte **New project**.
2. Dejte projektu libovolné jméno (např. `mistnosti`), zvolte heslo k databázi
   (zapamatujte si ho, ale během běžného provozu ho nebudete potřebovat) a region
   nejblíž vám (např. Frankfurt).
3. Počkejte cca minutu, než se projekt vytvoří.
4. Vlevo v menu klikněte na **SQL Editor** → **New query**.
5. Otevřete soubor [`supabase/schema.sql`](./supabase/schema.sql) z tohoto
   projektu, zkopírujte celý jeho obsah, vložte do editoru a klikněte **Run**.
   Tím vzniknou tabulky pro místnosti, rezervace a role.
6. Vlevo v menu **Authentication** → **Providers** → ujistěte se, že **Email**
   je zapnutý. Pak **Authentication** → **URL Configuration**: sem později (v
   kroku 4) doplníte adresu appky z Vercelu.
7. Vlevo v menu **Project Settings** → **API**. Odsud budete za chvíli
   potřebovat dvě hodnoty:
   - **Project URL**
   - klíč označený **anon** / **public** (případně nazvaný „publishable key")

Nechte tuto stránku otevřenou, hodnoty se budou hodit hned v dalším kroku.

---

## Krok 2 — Nahrát kód appky na GitHub

1. Stáhněte si tuto složku s appkou k sobě do počítače (rozbalte, pokud je jako .zip).
2. Na https://github.com klikněte **New repository**, dejte mu jméno
   (např. `mistnosti`), nechte ho **Private**, žádné další volby nezaškrtávejte,
   klikněte **Create repository**.
3. Na stránce nového (prázdného) repozitáře klikněte na odkaz
   **uploading an existing file**.
4. Přetáhněte myší **celý obsah** složky appky (všechny soubory a podsložky
   najednou) do okna prohlížeče. Počkejte, až se nahrají, a klikněte
   **Commit changes**.

Tím je kód appky na GitHubu a Vercel se k němu za chvíli připojí.

---

## Krok 3 — Nasadit na Vercel

1. Na https://vercel.com klikněte **Add New** → **Project**.
2. Najděte a vyberte repozitář `mistnosti`, který jste právě nahráli, klikněte **Import**.
3. V sekci **Environment Variables** přidejte dvě proměnné (hodnoty z konce Kroku 1):
   - `NEXT_PUBLIC_SUPABASE_URL` = vaše Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = váš anon/public klíč
4. Klikněte **Deploy** a počkejte cca minutu.
5. Až doběhne, dostanete adresu typu `https://mistnosti-xyz.vercel.app` —
   to je adresa vaší appky, tu budete sdílet s lidmi.

---

## Krok 4 — Propojit zpět se Supabase (důležité, jinak nedorazí přihlašovací e-maily se správným odkazem)

1. Zkopírujte adresu appky z Vercelu (`https://mistnosti-xyz.vercel.app`).
2. Vraťte se do Supabase → **Authentication** → **URL Configuration**.
3. **Site URL**: vložte adresu appky.
4. **Redirect URLs**: přidejte `https://mistnosti-xyz.vercel.app/auth/callback`.
5. Uložte.

---

## Krok 5 — Stát se prvním adminem

1. Otevřete appku na její adrese, zadejte svůj e-mail, klikněte na odkaz,
   který vám přijde do schránky (i do spamu se mrkněte). Tím vznikne váš účet
   — zatím s právem jen „náhled".
2. V Supabase → **SQL Editor** → **New query** spusťte (s vaším skutečným e-mailem):

   ```sql
   update public.profiles set role = 'admin' where email = 'vas@email.cz';
   ```

3. Obnovte appku v prohlížeči — nahoře uvidíte odznak **Admin** a odkaz **Správa**.

---

## Krok 6 — Přidat místnosti

1. V appce klikněte **Správa**.
2. Dole vyplňte formulář **Přidat místnost** (název, typ, kapacita) a uložte.
3. Přepněte na **Půdorys** a podívejte se, kde se místnost objevila. Polohu
   (X/Y v procentech, 0–100) doladíte zpátky ve **Správě** — 0/0 je vlevo
   nahoře, 100/100 vpravo dole.
4. Zopakujte pro všech 6–15 místností a prostor.

## Krok 7 — Přidat lidem práva

- Kdokoli s odkazem na appku se může přihlásit e-mailem, ale nově příchozí
  mají automaticky jen právo **náhled**.
- Ve **Správě** → sekce **Lidé a práva** uvidíte každého, kdo se aspoň jednou
  přihlásil, a můžete mu nastavit **Rezervující** (může si sám rezervovat a
  rušit vlastní rezervace) nebo **Admin** (spravuje vše).

---

## Jak appka funguje

- **Půdorys** — klikněte na místnost, otevře se panel s nadcházejícími
  rezervacemi a (pokud máte právo) formulářem na novou rezervaci.
- Databáze sama hlídá, aby se dvě rezervace stejné místnosti nepřekrývaly —
  při kolizi appka ukáže hlášku a rezervaci neuloží.
- Rezervaci může zrušit její autor, nebo admin za kohokoli.
- Vše (kdo co smí) je vynucené přímo v databázi (Row Level Security), ne jen
  v zobrazení appky — i kdyby si někdo zkoušel upravovat požadavky napřímo,
  databáze cizí práva neumožní.

## Náklady a limity zdarma úrovní

- **Vercel Hobby**: zdarma navždy pro nekomerční/interní použití, 100 GB
  přenosu měsíčně — na tuto appku víc než dost.
- **Supabase Free**: zdarma, 500 MB databáze, 50 000 aktivních uživatelů
  měsíčně. Jedno upozornění: pokud appku 7 dní v kuse nikdo nepoužije,
  Supabase projekt automaticky „uspí" a je potřeba ho ručně probudit
  kliknutím v Supabase dashboardu (data zůstanou zachovaná).

## Případné rozšíření (ne v této verzi)

- E-mailové připomínky před rezervací
- Export rezervací do Outlooku/Google Kalendáře (.ics)
- Přetahování místností myší na půdorysu (teď se poloha zadává čísly ve Správě)
- Nahrávání vlastního obrázku půdorysu na pozadí
