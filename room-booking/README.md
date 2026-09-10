# Rezervace místností

Webová appka na rezervaci 6–15 místností a prostor: jednoduchý půdorys,
3 úrovně přístupu (admin / rezervující / jen náhled) a přihlášení e-mailem
a heslem — funguje pro kohokoli, bez Microsoft nebo Google účtu. Náhled
(obsazenost, kdo co rezervoval) je veřejný i bez přihlášení — účet je
potřeba až na samotné vytvoření/zrušení rezervace.

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
   je zapnutý, a vypněte přepínač **Confirm email** (appka teď přihlašuje
   e-mailem a heslem bez nutnosti cokoli potvrzovat mailem — se zapnutým
   Confirm email by registrace nefungovala rovnou). Pak **Authentication** →
   **URL Configuration**: sem později (v kroku 4) doplníte adresu appky z
   Vercelu.
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

1. Otevřete appku na její adrese, klikněte na „Nemáte účet? Založit si ho",
   zadejte svůj e-mail a zvolte si heslo. Účet vznikne rovnou (nic se
   nepotvrzuje mailem) — zatím s právem jen „náhled".
2. V Supabase → **SQL Editor** → **New query** spusťte (s vaším skutečným e-mailem):

   ```sql
   update public.profiles set role = 'admin' where email = 'vas@email.cz';
   ```

3. Obnovte appku v prohlížeči — nahoře uvidíte odznak **Admin** a odkaz **Správa**.

---

## Krok 6 — Přidat místnosti

Nejrychlejší start: v Supabase → **SQL Editor** → **New query** vložte obsah
souboru [`supabase/seed_rooms.sql`](./supabase/seed_rooms.sql) a spusťte —
tím vznikne dočasné rozmístění (velký sál, 4 zasedačky, 5 cowork míst), než
si uděláte vlastní podle skutečného půdorysu. Je bezpečné spustit ho i
vícekrát, existující místnosti se nezdvojí.

Přejít na **Půdorys** — teď se objeví celé rozmístění. Cokoli si přejmenujte,
přesuňte nebo smažte ve **Správě**, přesně jak potřebujete.

Chcete přidat další místnost ručně? Ve **Správě** dole vyplňte formulář
**Přidat místnost** (název, typ, kapacita) a uložte, pak polohu (X/Y v
procentech, 0/0 vlevo nahoře, 100/100 vpravo dole) doladíte podle toho, jak to
vypadá na Půdorysu.

## Krok 6a — Veřejný náhled bez přihlášení

Appka teď funguje tak, že se **kdokoli s odkazem podívá na Půdorys a Denní
přehled i bez účtu** (kdo co rezervoval včetně jména/e-mailu je vidět
veřejně — pokud byste tohle náhodou nechtěli, dejte vědět, dá se to i
schovat jen pro přihlášené). Rezervovat nebo rušit rezervaci pořád jde
jen po přihlášení.

Na **novém** projektu tohle appka umí rovnou, není potřeba nic navíc — je
to součástí `schema.sql` z Kroku 1. Pokud appku provozujete déle a
`schema.sql` jste spouštěli dřív, spusťte navíc v Supabase → **SQL Editor**
obsah souboru
[`supabase/add_public_dashboard_view.sql`](./supabase/add_public_dashboard_view.sql).

## Krok 6b — Měsíční limit hodin (volitelné, podle smlouvy)

Pokud má někdo ve smlouvě smluvený počet hodin měsíčně — na **novém**
projektu je tohle už součástí `schema.sql`, nic navíc dělat nemusíte. Na
**existujícím** projektu:

1. V Supabase → **SQL Editor** → **New query** spusťte obsah souboru
   [`supabase/add_monthly_hours_limit.sql`](./supabase/add_monthly_hours_limit.sql)
   (jednou).
2. Ve **Správě** → sekce **Lidé a práva** teď u každého člověka uvidíte pole
   „Limit hodin/měsíc" — vyplňte a odklikněte mimo pole, uloží se to samo.
   Kdo limit nemá vyplněný, appka ho nijak nesleduje.
3. Sekce **Čerpání hodin** níž ukáže, kolik kdo se svým limitem za zvolený
   měsíc vyčerpal. Je to jen evidenční — **appka nikomu kvůli limitu rezervaci
   nezablokuje**, jen u přečerpaných hodin ukáže „k doúčtování", ať to jde
   podle toho vyfakturovat.

## Krok 6c — Zrušit celou sérii opakované rezervace jedním klikem (POVINNÉ, jakmile appku aktualizujete)

⚠️ Na **existujícím** projektu tohle prosím spusťte hned po nahrání téhle
verze appky — appka teď při každé (i jednorázové) rezervaci posílá do
databáze i nové pole `recurrence_group_id`. Dokud sloupec v databázi
nebude existovat, **nepůjde uložit vůbec žádná nová rezervace** (appka
ukáže „Rezervaci se nepodařilo uložit").

1. V Supabase → **SQL Editor** → **New query** spusťte obsah souboru
   [`supabase/add_recurrence_group.sql`](./supabase/add_recurrence_group.sql)
   (jednou).
2. Hotovo — rezervace (jednorázové i opakované) zase fungují a u opakovaných
   navíc přibude tlačítko „Zrušit sérii", které smaže všechny termíny dané
   série najednou.

Na **novém** projektu je tohle už součástí `schema.sql`, tenhle krok
netřeba dělat.

## Krok 6d — Skupiny místností (kdo vidí co) — nepovinné

Appka teď umí omezit, jaké místnosti/prostory daný člověk vůbec uvidí —
třeba skupina „Fixní místo" pro lidi se stálým stolem, kterým cowork
prostory nedávají smysl (jen zasedačky a Velký sál). Kdo skupinu nemá
přiřazenou, appka mu dál ukazuje úplně vše, přesně jako dosud — tenhle
krok je čistě volitelný.

Na **existujícím** projektu spusťte jednou v Supabase → **SQL Editor**
obsah souboru
[`supabase/add_room_groups.sql`](./supabase/add_room_groups.sql). Na
**novém** projektu je to už součástí `schema.sql`.

Nastavení pak celé probíhá ve **Správě**:

1. V sekci **Skupiny místností** založte skupinu (např. „Fixní místo") a
   zaškrtněte, které místnosti/prostory do ní patří (co v ní lidé uvidí).
2. V sekci **Lidé a práva** u daného člověka vyberte tu skupinu ve sloupci
   „Skupina místností".

Je to jen na úrovni zobrazení appky (Půdorys, seznam, Denní přehled) — ne
vynucené v databázi jako role/rezervace, takže někdo s přímým odkazem na
konkrétní místnost (třeba starý QR kód) se k ní pořád dostane. Kdyby bylo
potřeba tohle vynutit i natvrdo, dá se to doplnit.

## Krok 6e — Popisky a přetahování na půdorysu (volitelné)

Appka teď umí na půdorys přidat i volný text bez rezervace (např.
„Recepce", „Kuchyňka", „WC") a v admin sekci se místnosti i popisky dají
přesouvat přímo přetažením myší/prstem místo ručního přepisování čísel X/Y.

Na **existujícím** projektu spusťte jednou v Supabase → **SQL Editor**
obsah souboru
[`supabase/add_floorplan_labels.sql`](./supabase/add_floorplan_labels.sql).
Na **novém** projektu je to už součástí `schema.sql`.

Ve **Správě** přibyla sekce **Půdorys — rozmístění**:

1. Novou sekci najdete hned pod „Místnosti a prostory".
2. Nový popisek přidáte dole přes „+ Nový popisek" — objeví se uprostřed
   půdorysu.
3. Místnost i popisek přetáhnete myší (na telefonu/tabletu prstem) přímo
   na požadované místo — pozice se uloží hned po puštění, není potřeba nic
   dalšího ukládat.
4. Text popisku jde přejmenovat v tabulce pod půdorysem, smazat jde tam
   taky.

Popisky se zobrazují i veřejně na Půdorysu v appce (jen jako text, nejde
na ně kliknout ani rezervovat).

## Krok 6f — Moje rezervace, úprava času a týdenní přehled

Žádný nový krok v Supabase, jen novinky v appce samotné, žádná databázová
změna:

- **Tlačítko „Moje rezervace"** hned pod horní lištou (viditelné po
  přihlášení) ukáže všechny vaše nadcházející rezervace napříč
  místnostmi na jednom místě — nemusíte hledat, ve které místnosti jste
  si co zarezervovali.
- U každé rezervace (tady i v panelu konkrétní místnosti) je teď kromě
  „Zrušit" i tlačítko **„Upravit čas"** — otevře se krátký formulář
  přímo na místě, kde jde změnit datum i čas Od–Do, bez rušení a
  zakládání nové rezervace. Jde jen o vlastní rezervace (admin může
  upravit i cizí).
- **Denní přehled** dostal přepínač **Den / Týden** — Týden ukáže
  obsazenost všech místností na 7 dní najednou v tabulce (týden začíná
  pondělím). Šipky ◀ ▶ pak v tomto režimu listují po celých týdnech.
- Opravena chyba, kdy tlačítko „Další den" u Denního přehledu u některých
  časových pásem (včetně českého) nic neudělalo — počítalo datum přes
  UTC, což se v létě/zimě posunulo o den jinam, než čekáte. Teď appka
  počítá vždy s místním datem.

## Krok 6g — Kalendář jako v Google Calendari, přejmenování "Stůl" a vzhled podle brand manuálu

Zase žádná databázová změna, jen appka samotná:

- **Denní přehled je teď interaktivní** — klikněte na volné místo u dané
  místnosti a appka rovnou otevře rezervaci na ten čas (zaokrouhlený na
  čtvrthodiny). Vlastní rezervaci (admin i cizí) jde přímo v přehledu
  **přetáhnout** na jiný čas myší/prstem — uloží se to hned po puštění.
  Klik na existující termín (bez přetažení) ukáže kartičku s tím, kdo si
  ho zarezervoval a s jakým popisem/účelem, včetně možnosti ho rovnou
  zrušit. V Týdenním přehledu jde stejně tak kliknout na prázdný den u
  místnosti a založit rezervaci (na výchozí čas 9–10).
- Typ místnosti **"Prostor" je přejmenovaný na "Stůl"** všude v appce
  (výběr typu ve Správě, štítky u položek, seznam na Půdorysu) — lépe to
  sedí na jednotlivá cowork místa.
- **Vzhled appky teď vychází z brand manuálu Business Gate** — hlavní
  písmo Work Sans, časy/kódy místností Helvetica, a jako jediný barevný
  akcent brand červená (`#E31E24`) místo původní modré. Tlačítka, karty
  a vstupní pole mají zaoblenější rohy a jemné stíny/přechody při najetí
  myší — appka by měla působit měkčeji a sjednoceně se zbytkem značky.

## Krok 7 — Přidat lidem práva

- Kdokoli s odkazem na appku si může sám založit účet e-mailem a heslem, ale
  nově příchozí mají automaticky jen právo **náhled**.
- Ve **Správě** → sekce **Lidé a práva** uvidíte každého, kdo se aspoň jednou
  přihlásil, a můžete mu nastavit **Rezervující** (může si sám rezervovat a
  rušit vlastní rezervace) nebo **Admin** (spravuje vše).

## Krok 8 — QR kódy pro last-minute rezervaci od dveří

Ve **Správě** dole je teď sekce **QR kódy pro rezervaci od dveří** — appka
vygeneruje QR kód pro každou místnost/prostor (funguje hned, nic se nikde
nemusí nastavovat). Naskenování mobilem otevře appku rovnou na rezervačním
panelu té konkrétní místnosti a čas „od" má předvyplněný na „teď" — kdo
místnost potřebuje hned, zvládne rezervaci na pár klepnutí, bez hledání
místnosti v seznamu.

- Kliknutím na „Otevřít QR" se obrázek otevře v nové záložce — tam ho jde
  uložit (nebo rovnou vytisknout) a nalepit u dveří.
- QR kód vzniká přes veřejnou službu `api.qrserver.com` (žádné heslo ani
  citlivá data se nikam neposílají, jen adresa appky).
- Kdo QR naskenuje bez účtu, appka mu obsazenost i tak ukáže — teprve na
  samotné „Zarezervovat" ho appka pošle na přihlášení a po přihlášení ho
  vrátí přesně zpátky na stejnou místnost.

## Přihlašování — e-mail a heslo

- Appka používá klasické přihlášení e-mailem a heslem, ne odkaz do e-mailu —
  lidé se tak budou přihlašovat opakovaně, aniž by pokaždé čekali na e-mail
  (a naráželi na limit 2 e-maily/hodinu, viz níže).
- Nový člověk si účet založí sám tlačítkem „Nemáte účet? Založit si ho" na
  přihlašovací stránce — účet vznikne rovnou, žádné potvrzování e-mailem.
- Kdo si dřív účet vytvořil starým způsobem (přes odkaz v e-mailu) a heslo
  ještě nemá, nastaví si ho přes „Zapomenuté heslo?" — přijde mu e-mail
  s odkazem na nastavení hesla, pak už se přihlašuje normálně heslem.
- „Zapomenuté heslo" pořád posílá e-mail (Supabase), takže Gmail SMTP (viz
  Krok 1 a poznámka níže) je i tak dobré mít nastavené — jen se používá
  mnohem méně často než dřív, kdy šel e-mail při každém přihlášení.

---

## Jak appka funguje

- **Půdorys** — klikněte na místnost, otevře se panel s nadcházejícími
  rezervacemi a (pokud máte právo) formulářem na novou rezervaci.
- **Denní přehled** pod půdorysem ukazuje všechny místnosti najednou na jedné
  časové ose pro zvolený den (šipky ◀ ▶, tlačítko „Dnes" nebo datum přepnou
  den) — kdo je kde a kdy, na jeden pohled, bez proklikávání jednotlivých
  místností. Tlačítka ◀ „Dnes" ▶ mají na telefonu větší dotykovou plochu
  (min. 44×44 px), ať se do nich spolehlivě trefí prst.
- Databáze sama hlídá, aby se dvě rezervace stejné místnosti nepřekrývaly —
  při kolizi appka ukáže hlášku a rezervaci neuloží.
- Rezervaci může zrušit její autor, nebo admin za kohokoli.
- **Na telefonu** (úzká obrazovka) se vizuální půdorys schová a zůstává jen
  seznam — zasedačky rovnou vypsané, cowork a ostatní prostory schované za
  rozklikávacím „Cowork a další prostory". Na širší obrazovce (počítač,
  tablet naležato) je to naopak — vizuální půdorys, bez duplicitního seznamu
  pod ním. Denní přehled pod tím se na úzké obrazovce nemačká donekonečna —
  rozjede se vodorovně a dá se v něm posouvat prstem doleva/doprava.
- **Rezervační panel na telefonu** se otevře rovnou (i po naskenování QR
  kódu) bez blikání či poskakování stránky, formulář „Nová rezervace" je
  hned pod názvem místnosti (nemusí se rolovat přes seznam obsazenosti) a
  hlavička s křížkem na zavření zůstává nahoře i při rolování.
- **Hlavička appky na telefonu** je jeden úzký řádek s logem a přepínačem
  ☰ — teprve po klepnutí se pod ním rozbalí odznak role, e-mail, odkazy
  Správa/Půdorys a Odhlásit. Appka se tak vždy vejde na šířku obrazovky;
  vodorovně se dá posouvat jen Denní přehled (a širší tabulky ve Správě,
  v jejich vlastním rámečku) — nikdy celá stránka.
- **Opakovaná rezervace** — u formuláře „Nová rezervace" jde zvolit
  „Opakování": každý týden nebo jednou za měsíc, se stejným časem Od–Do,
  až do zadaného konce (pole „Opakovat do"). Appka založí rezervaci pro
  každý termín zvlášť (nejvýš 60 najednou, jako pojistka proti překlepu
  v datu) a napíše, kolik jich vzniklo — pokud je nějaký termín obsazený,
  ten jeden přeskočí a napíše který, ostatní založí normálně. U každého
  termínu jde v seznamu „Nadcházející rezervace" zrušit buď jen on sám
  („Zrušit"), nebo celá série najednou („Zrušit sérii") — stejně tak ve
  Správě u sekce „Poslední rezervace" tlačítkem „Smazat sérii". Vyžaduje
  Krok 6c níž.
- **Skupiny místností** — komu je přiřazená (viz Krok 6d), appka mu na
  Půdorysu, v seznamu i v Denním přehledu ukáže jen místnosti/prostory z
  jeho skupiny. Bez přiřazené skupiny appka pořád ukazuje úplně vše.
- **Limit hodin** se počítá jen z rezervací zasedaček — cowork a další
  prostory se do vyčerpaného limitu nezapočítávají.
- Vše (kdo co smí) je vynucené přímo v databázi (Row Level Security), ne jen
  v zobrazení appky — i kdyby si někdo zkoušel upravovat požadavky napřímo,
  databáze cizí práva neumožní.

### Přehled toho, co si kdo rezervoval

- Ve **Správě** → **Čerpání hodin** klikněte u kohokoli na „Zobrazit
  rezervace" — rozbalí se seznam všech jeho rezervací za zvolený měsíc
  (i těch, co se do limitu nepočítají — u nich appka napíše „nepočítá se
  do limitu").
- Ve **Správě** → **Poslední rezervace** je nahoře filtr „Kdo" — vybere se
  konkrétní člověk a tabulka (posledních 100 rezervací celkem) se
  zobrazí jen za něj.

### Pokud i po nahrání appka posílá anonymní návštěvníky rovnou na přihlášení

Appka má náhled (Půdorys, Denní přehled) veřejný i bez přihlášení — na to
slouží soubory `middleware.ts`, `app/page.tsx` a `app/dashboard/page.tsx`.
Pokud po nahrání zkoušíte appku v anonymním okně a pořád vás to hodí na
`/login`, nejčastější příčina je, že se do GitHubu nenahrál úplně každý
soubor z balíčku (typicky právě `middleware.ts`, protože leží přímo v
kořeni složky appky, ne v žádné podsložce — snadno se přehlédne). Zkontrolujte
na GitHubu, že soubor `middleware.ts` existuje a obsahuje `"/dashboard"` v
seznamu veřejných cest, a ve Vercelu na záložce **Deployments**, že poslední
nasazení odpovídá poslednímu commitu na GitHubu. Pak zkuste anonymní okno
znovu s natvrdo obnovenou stránkou (Ctrl/Cmd+Shift+R).

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
