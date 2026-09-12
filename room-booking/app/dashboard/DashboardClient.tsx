"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import DayOverview from "./DayOverview";
import type { Profile, Room, Booking, FloorplanLabel } from "@/lib/types";
import { addDaysLocalStr, toLocalDateStr, todayLocalStr } from "@/lib/date";
import { FLOORS } from "@/lib/floors";

// Zaokrouhlí čas nahoru na nejbližších 5 minut — pro "rezervovat od teď".
function roundedTime(date: Date) {
  const ms = 1000 * 60 * 5;
  const rounded = new Date(Math.ceil(date.getTime() / ms) * ms);
  return rounded.toTimeString().slice(0, 5);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function fmtDateShort(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
  });
}

type Recurrence = "none" | "weekly" | "monthly";

// Vrátí datum posunuté o n opakování dopředu (týden/měsíc), jako řetězec YYYY-MM-DD.
function addPeriod(dateStr: string, freq: Exclude<Recurrence, "none">, n: number) {
  if (freq === "weekly") {
    return addDaysLocalStr(dateStr, 7 * n);
  }
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return toLocalDateStr(d);
}

// Bezpečnostní strop, ať překlep v datu konce (např. o pár let dál) nezaloží
// stovky rezervací najednou.
const MAX_OCCURRENCES = 60;

function roomCode(rooms: Room[], room: Room) {
  const idx = rooms.findIndex((r) => r.id === room.id);
  return `R-${String(idx + 1).padStart(2, "0")}`;
}

export default function DashboardClient({
  profile,
  initialRooms,
  initialBookings,
  initialSelectedRoomId = null,
  restrictedRoomIds = null,
  initialLabels = [],
}: {
  profile: Profile | null;
  initialRooms: Room[];
  initialBookings: Booking[];
  initialSelectedRoomId?: string | null;
  // NULL = appka ukazuje všechny místnosti/prostory (výchozí). Pole =
  // uživatelova skupina místností omezuje, co vidí (např. jen zasedačky
  // + Velký sál, bez ostatního coworku).
  restrictedRoomIds?: string[] | null;
  initialLabels?: FloorplanLabel[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [bookings, setBookings] = useState(initialBookings);
  const [labels, setLabels] = useState(initialLabels);
  // QR kód u místnosti vede na /dashboard?room=<id> — panel se otevře už
  // z prvního vykreslení (initialSelectedRoomId přijde ze serveru), ať se
  // po naskenování na telefonu nic neblýskne ani neskočí.
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialSelectedRoomId);
  const [date, setDate] = useState(() => todayLocalStr());
  const [start, setStart] = useState(() => roundedTime(new Date()));
  const [end, setEnd] = useState(() => roundedTime(new Date(Date.now() + 60 * 60000)));
  const [purpose, setPurpose] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Přehled všech vlastních rezervací napříč místnostmi ("Moje rezervace").
  const [showMyBookings, setShowMyBookings] = useState(false);

  // Úprava času existující rezervace (vlastní, nebo cokoliv pro admina) —
  // funguje jak v panelu místnosti, tak v "Moje rezervace".
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Při otevření jiné místnosti (nebo zavření panelu) smažeme hlášky
  // z předchozí rezervace, ať tam nevisí zpráva ke špatné místnosti, a
  // zavřeme rozdělanou úpravu času, ať nezůstane viset u položky, která
  // už tu není vidět.
  useEffect(() => {
    setFormError(null);
    setFormNotice(null);
    setEditingBookingId(null);
    setEditError(null);
  }, [selectedRoomId]);

  // Dokud je panel otevřený (typicky přes celou obrazovku na telefonu),
  // uzamkneme scroll stránky pod ním — jinak se na mobilu snadno rozjede
  // "dvojitý" scroll (panel + stránka pod ním) a celé to nepříjemně poskakuje.
  useEffect(() => {
    if (selectedRoomId || showMyBookings) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [selectedRoomId, showMyBookings]);

  const canBook = profile?.role === "booker" || profile?.role === "admin";
  const now = Date.now();

  // Skupina místností filtruje, co se vůbec zobrazí — `rooms` (celý
  // seznam) se dál používá jen pro číslování R-06 apod., ať kódy
  // místností zůstanou stejné bez ohledu na to, kdo se dívá.
  const visibleRooms = useMemo(() => {
    if (!restrictedRoomIds) return rooms;
    const set = new Set(restrictedRoomIds);
    return rooms.filter((r) => set.has(r.id));
  }, [rooms, restrictedRoomIds]);

  // Co si sám uživatel chce nechat zobrazovat v Denním/Týdenním přehledu
  // (nad rámec toho, co už mu omezuje admin skupinou místností) — je toho
  // tam dost, ať si každý může schovat to, co ho nezajímá. Ukládá se jen
  // v tomhle prohlížeči (localStorage), appka to nikam neposílá.
  const [overviewShowMeetingRooms, setOverviewShowMeetingRooms] = useState(true);
  const [overviewShowSpaces, setOverviewShowSpaces] = useState(true);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bga-overview-filter");
      if (raw) {
        const parsed = JSON.parse(raw) as { meeting_room?: boolean; space?: boolean };
        if (typeof parsed.meeting_room === "boolean") setOverviewShowMeetingRooms(parsed.meeting_room);
        if (typeof parsed.space === "boolean") setOverviewShowSpaces(parsed.space);
      }
    } catch {
      // localStorage nedostupné (soukromé okno apod.) — appka jede dál s výchozím "zobrazit vše".
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "bga-overview-filter",
        JSON.stringify({ meeting_room: overviewShowMeetingRooms, space: overviewShowSpaces })
      );
    } catch {
      // viz výše
    }
  }, [overviewShowMeetingRooms, overviewShowSpaces]);

  const overviewRoomIds = useMemo(
    () =>
      visibleRooms
        .filter((r) => (r.type === "meeting_room" ? overviewShowMeetingRooms : overviewShowSpaces))
        .map((r) => r.id),
    [visibleRooms, overviewShowMeetingRooms, overviewShowSpaces]
  );

  const meetingRooms = visibleRooms.filter((r) => r.type === "meeting_room");
  const spaceRooms = visibleRooms.filter((r) => r.type !== "meeting_room");

  const selectedRoom = visibleRooms.find((r) => r.id === selectedRoomId) ?? null;

  // Patro, které se zrovna ukazuje na půdorysu — výchozí je první patro,
  // na kterém pro tohohle uživatele vůbec nějaká místnost je.
  const [selectedFloor, setSelectedFloor] = useState<number>(() => {
    const firstWithRoom = FLOORS.find((f) => rooms.some((r) => r.floor === f.value));
    return (firstWithRoom ?? FLOORS[0]).value;
  });
  const [floorplanExpanded, setFloorplanExpanded] = useState(false);
  // Stejný "uzamkni scroll pod tím" trik jako u panelu místnosti/Mých
  // rezervací — zvětšený půdorys je taky přes celou obrazovku na mobilu.
  useEffect(() => {
    if (!floorplanExpanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [floorplanExpanded]);
  const floorRooms = visibleRooms.filter((r) => r.floor === selectedFloor);
  const floorLabels = labels.filter((l) => l.floor === selectedFloor);
  const currentFloorInfo = FLOORS.find((f) => f.value === selectedFloor) ?? FLOORS[0];

  const roomBookings = useMemo(() => {
    if (!selectedRoomId) return [];
    return bookings
      .filter((b) => b.room_id === selectedRoomId)
      .filter((b) => new Date(b.ends_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [bookings, selectedRoomId, now]);

  // Všechny vlastní nadcházející rezervace napříč místnostmi — ať člověk
  // nemusí procházet místnost po místnosti, aby si třeba jen zrušil nebo
  // posunul jednu rezervaci.
  const myBookings = useMemo(() => {
    if (!profile) return [];
    return bookings
      .filter((b) => b.user_id === profile.id)
      .filter((b) => new Date(b.ends_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [bookings, profile, now]);

  function isOccupiedNow(roomId: string) {
    return bookings.some(
      (b) =>
        b.room_id === roomId &&
        new Date(b.starts_at).getTime() <= now &&
        new Date(b.ends_at).getTime() > now
    );
  }

  // 🔒 = trvale obsazené (fixní místo, mimo kalendář), 🔶 = teď obsazené
  // běžnou rezervací, 🟢 = volné.
  function occupancyEmoji(room: Room) {
    if (room.permanent_occupant) return "🔒";
    return isOccupiedNow(room.id) ? "🔶" : "🟢";
  }

  // Sdílené vykreslení půdorysu (reálný obrázek patra + místnosti + volné
  // popisky) — používá se jak v normální velikosti na stránce, tak
  // zvětšené přes celou obrazovku (hlavně pro telefon, kde je normální
  // náhled na čtení moc malý).
  function renderFloorplanContent() {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentFloorInfo.value}
          src={currentFloorInfo.svg}
          alt={`Půdorys — ${currentFloorInfo.label}`}
          className="floorplan-bg"
          draggable={false}
        />
        {floorRooms.map((room) => {
          const permanent = !!room.permanent_occupant;
          const occupied = permanent || isOccupiedNow(room.id);
          return (
            <button
              key={room.id}
              className={`room-box ${room.type} ${occupied ? "occupied" : ""} ${
                room.pos_w && room.pos_h ? "sized" : ""
              } ${permanent ? "locked" : ""} ${room.label_rotated ? "rotated" : ""}`}
              style={{
                left: `${room.pos_x}%`,
                top: `${room.pos_y}%`,
                width: room.pos_w ? `${room.pos_w}%` : undefined,
                height: room.pos_h ? `${room.pos_h}%` : undefined,
              }}
              title={permanent ? `Trvale obsazeno – ${room.permanent_occupant}` : undefined}
              onClick={() => {
                setFloorplanExpanded(false);
                setSelectedRoomId(room.id);
              }}
            >
              <span className="room-box-inner">
                <span className="code">{roomCode(rooms, room)}</span>
                <span className="name">
                  <span className={`status-dot ${permanent ? "locked" : occupied ? "busy" : "free"}`} />
                  {permanent ? "🔒 " : ""}
                  {room.name}
                </span>
              </span>
            </button>
          );
        })}
        {floorLabels.map((label) => (
          <span
            key={label.id}
            className="floorplan-label"
            style={{ left: `${label.pos_x}%`, top: `${label.pos_y}%` }}
          >
            {label.text}
          </span>
        ))}
      </>
    );
  }

  // Zvyšuje se při každém úspěšném refresh() — Denní/Týdenní přehled na
  // to má vlastní efekt, ať se i on přenačte, když se rezervace založí,
  // zruší nebo přesune odjinud (panel místnosti, Moje rezervace, ale i
  // přetažení přímo v přehledu).
  const [bookingsVersion, setBookingsVersion] = useState(0);

  async function refresh() {
    const supabase = createClient();
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.from("rooms").select("*").order("name"),
      supabase
        .from("bookings")
        .select("*, profiles(email, full_name)")
        .gte("ends_at", since)
        .order("starts_at"),
    ]);
    if (r) setRooms(r);
    if (b) setBookings(b as unknown as Booking[]);
    setBookingsVersion((v) => v + 1);
  }

  // Klik na volné místo v Denním/Týdenním přehledu ("okno v kalendáři")
  // otevře panel dané místnosti rovnou s předvyplněným datem a časem —
  // jako v Google Calendari.
  function handleCreateFromOverview(
    roomId: string,
    dateStr: string,
    startTime: string,
    endTime: string
  ) {
    setSelectedRoomId(roomId);
    setDate(dateStr);
    setStart(startTime);
    setEnd(endTime);
  }

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!selectedRoomId || !profile) return;
    // Pojistka navíc — formulář se u trvale obsazené místnosti ani
    // nevykresluje, ale kdyby se sem přesto dostalo volání (např. přes
    // Denní přehled), rezervaci to i tak odmítne.
    if (selectedRoom?.permanent_occupant) return;
    setFormError(null);
    setFormNotice(null);

    if (new Date(`${date}T${end}:00`) <= new Date(`${date}T${start}:00`)) {
      setFormError("Konec musí být po začátku.");
      return;
    }

    // Bez opakování je to jen ten jeden zvolený den; s opakováním se
    // stejný čas Od–Do zopakuje každý týden/měsíc až do zvoleného konce.
    const occurrenceDates = [date];
    if (recurrence !== "none") {
      if (!recurrenceEnd) {
        setFormError("Zadejte datum, do kdy se má rezervace opakovat.");
        return;
      }
      if (recurrenceEnd < date) {
        setFormError("Konec opakování musí být až po prvním termínu.");
        return;
      }
      let n = 1;
      while (occurrenceDates.length < MAX_OCCURRENCES) {
        const next = addPeriod(date, recurrence, n);
        if (next > recurrenceEnd) break;
        occurrenceDates.push(next);
        n++;
      }
    }

    // Sdílené UUID pro celou sérii — appka pak podle něj umí zrušit
    // všechny termíny najednou jedním klikem. U jednorázové rezervace
    // zůstává recurrence_group_id prázdné.
    const groupId =
      recurrence !== "none" && occurrenceDates.length > 1
        ? crypto.randomUUID()
        : null;

    setSubmitting(true);
    const supabase = createClient();
    let successCount = 0;
    const conflictDates: string[] = [];
    let otherError = false;

    for (const d of occurrenceDates) {
      const { error } = await supabase.from("bookings").insert({
        room_id: selectedRoomId,
        user_id: profile.id,
        starts_at: new Date(`${d}T${start}:00`).toISOString(),
        ends_at: new Date(`${d}T${end}:00`).toISOString(),
        purpose: purpose || null,
        recurrence_group_id: groupId,
      });
      if (error) {
        if (error.message.toLowerCase().includes("exclude") || error.code === "23P01") {
          conflictDates.push(d);
        } else {
          otherError = true;
        }
      } else {
        successCount++;
      }
    }
    setSubmitting(false);

    if (occurrenceDates.length === 1) {
      if (conflictDates.length > 0) {
        setFormError("V tomto čase je místnost už obsazená.");
        return;
      }
      if (otherError) {
        setFormError("Rezervaci se nepodařilo uložit. Zkuste to znovu.");
        return;
      }
    } else if (successCount === 0) {
      setFormError(
        "Žádný z termínů se nepodařilo zarezervovat — všechny kolidují s existující rezervací."
      );
      return;
    } else {
      const parts = [`Vytvořeno ${successCount} z ${occurrenceDates.length} termínů opakované rezervace.`];
      if (conflictDates.length > 0) {
        parts.push(`Obsazeno bylo u: ${conflictDates.map(fmtDateShort).join(", ")}.`);
      }
      if (otherError) {
        parts.push("U některých termínů nastala chyba — zkuste je založit ručně.");
      }
      setFormNotice(parts.join(" "));
    }

    setPurpose("");
    await refresh();
  }

  async function handleCancel(bookingId: string) {
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("id", bookingId);
    await refresh();
  }

  async function handleCancelSeries(groupId: string) {
    if (!confirm("Zrušit všechny termíny téhle opakované rezervace?")) return;
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("recurrence_group_id", groupId);
    await refresh();
  }

  function startEditBooking(b: Booking) {
    setEditingBookingId(b.id);
    setEditDate(toLocalDateStr(new Date(b.starts_at)));
    setEditStart(new Date(b.starts_at).toTimeString().slice(0, 5));
    setEditEnd(new Date(b.ends_at).toTimeString().slice(0, 5));
    setEditError(null);
  }

  function cancelEditBooking() {
    setEditingBookingId(null);
    setEditError(null);
  }

  async function saveEditBooking(bookingId: string) {
    setEditError(null);
    if (new Date(`${editDate}T${editEnd}:00`) <= new Date(`${editDate}T${editStart}:00`)) {
      setEditError("Konec musí být po začátku.");
      return;
    }
    setEditSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("bookings")
      .update({
        starts_at: new Date(`${editDate}T${editStart}:00`).toISOString(),
        ends_at: new Date(`${editDate}T${editEnd}:00`).toISOString(),
      })
      .eq("id", bookingId);
    setEditSaving(false);
    if (error) {
      if (error.message.toLowerCase().includes("exclude") || error.code === "23P01") {
        setEditError("V tomto novém čase je místnost už obsazená.");
      } else {
        setEditError("Změnu se nepodařilo uložit. Zkuste to znovu.");
      }
      return;
    }
    setEditingBookingId(null);
    await refresh();
  }

  // Sdílené vykreslení jednoho řádku rezervace — používá se jak v panelu
  // konkrétní místnosti, tak v "Moje rezervace" (tam navíc s názvem
  // místnosti, ať je jasné, čeho se termín týká).
  function renderBookingRow(b: Booking, showRoomName = false) {
    const canManage = b.user_id === profile?.id || profile?.role === "admin";
    const isEditing = editingBookingId === b.id;
    const bookingRoom = rooms.find((r) => r.id === b.room_id);
    return (
      <div className="booking-row" key={b.id}>
        {isEditing ? (
          <div className="booking-edit-form">
            {showRoomName && <div className="who">{bookingRoom?.name ?? "—"}</div>}
            <div className="row">
              <div>
                <label htmlFor={`edit-date-${b.id}`}>Datum</label>
                <input
                  id={`edit-date-${b.id}`}
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`edit-start-${b.id}`}>Od</label>
                <input
                  id={`edit-start-${b.id}`}
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor={`edit-end-${b.id}`}>Do</label>
                <input
                  id={`edit-end-${b.id}`}
                  type="time"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </div>
            </div>
            {editError && <p className="form-error">{editError}</p>}
            <div className="booking-row-actions">
              <button
                className="btn primary"
                disabled={editSaving}
                onClick={() => saveEditBooking(b.id)}
              >
                {editSaving ? "Ukládám…" : "Uložit"}
              </button>
              <button className="btn" onClick={cancelEditBooking}>
                Zrušit úpravu
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="time">
                {showRoomName && <strong>{bookingRoom?.name ?? "—"} · </strong>}
                {fmtDay(b.starts_at)} · {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                {b.recurrence_group_id && <span className="recurrence-tag"> · opakuje se</span>}
              </div>
              <div className="who">
                {b.profiles?.full_name || b.profiles?.email || "Neznámý"}
                {b.purpose ? ` — ${b.purpose}` : ""}
              </div>
            </div>
            {canManage && (
              <div className="booking-row-actions">
                <button className="btn" onClick={() => startEditBooking(b)}>
                  Upravit čas
                </button>
                <button className="cancel" onClick={() => handleCancel(b.id)}>
                  Zrušit
                </button>
                {b.recurrence_group_id && (
                  <button
                    className="cancel"
                    onClick={() => handleCancelSeries(b.recurrence_group_id as string)}
                  >
                    Zrušit sérii
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <Header profile={profile} />

      {profile && (
        <div className="my-bookings-bar">
          <button className="btn my-bookings-btn" onClick={() => setShowMyBookings(true)}>
            Moje rezervace{myBookings.length > 0 ? ` (${myBookings.length})` : ""}
          </button>
        </div>
      )}

      <div className="floorplan-wrap">
        <div className="floorplan-toolbar">
          <div className="floor-tabs">
            {FLOORS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`btn floor-tab ${selectedFloor === f.value ? "active" : ""}`}
                onClick={() => setSelectedFloor(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn floorplan-expand-btn"
            onClick={() => setFloorplanExpanded(true)}
            aria-label="Zobrazit půdorys na celou obrazovku"
          >
            ⤢ Zobrazit půdorys
          </button>
        </div>

        <div className="floorplan has-bg" style={{ aspectRatio: currentFloorInfo.aspect }}>
          {renderFloorplanContent()}
          {floorRooms.length === 0 && (
            <p className="floorplan-empty-hint">
              Na tomhle patře zatím nejsou žádné místnosti k rezervaci.
            </p>
          )}
        </div>

        <div className="room-list-mobile">
          <div className="room-list">
            {meetingRooms.map((room) => (
              <button
                key={room.id}
                className="room-list-card"
                onClick={() => setSelectedRoomId(room.id)}
              >
                <span className="code">{roomCode(rooms, room)} · zasedačka</span>
                <div className="name">
                  {occupancyEmoji(room)} {room.name}
                </div>
              </button>
            ))}
            {visibleRooms.length === 0 && (
              <p style={{ color: "#55617a", fontSize: 14 }}>
                {rooms.length === 0
                  ? "Zatím tu nejsou žádné místnosti. Admin je může přidat v sekci Správa."
                  : "Pro váš účet zatím nejsou přiřazené žádné místnosti — ozvěte se správci."}
              </p>
            )}
          </div>

          {spaceRooms.length > 0 && (
            <details className="room-spaces">
              <summary>Stoly ({spaceRooms.length})</summary>
              <div className="room-list">
                {spaceRooms.map((room) => (
                  <button
                    key={room.id}
                    className="room-list-card"
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <span className="code">{roomCode(rooms, room)} · stůl</span>
                    <div className="name">
                      {occupancyEmoji(room)} {room.name}
                    </div>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="overview-user-filter">
        <span>Zobrazit v přehledu:</span>
        <label>
          <input
            type="checkbox"
            checked={overviewShowMeetingRooms}
            onChange={(e) => setOverviewShowMeetingRooms(e.target.checked)}
          />{" "}
          Zasedačky
        </label>
        <label>
          <input
            type="checkbox"
            checked={overviewShowSpaces}
            onChange={(e) => setOverviewShowSpaces(e.target.checked)}
          />{" "}
          Stoly / cowork
        </label>
      </div>

      <DayOverview
        rooms={rooms}
        visibleRoomIds={overviewRoomIds}
        currentUserId={profile?.id ?? null}
        isAdmin={profile?.role === "admin"}
        onCreateBooking={handleCreateFromOverview}
        onBookingsChanged={refresh}
        refreshKey={bookingsVersion}
      />

      {selectedRoom && (
        <div className="panel-overlay" onClick={() => setSelectedRoomId(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <div>
                <h2 className="font-display">{selectedRoom.name}</h2>
                <p className="meta">
                  {selectedRoom.type === "meeting_room" ? "Zasedačka" : "Stůl"}
                  {selectedRoom.capacity ? ` · kapacita ${selectedRoom.capacity}` : ""}
                  {selectedRoom.description ? ` · ${selectedRoom.description}` : ""}
                </p>
              </div>
              <button className="panel-close" onClick={() => setSelectedRoomId(null)} aria-label="Zavřít">
                ×
              </button>
            </div>

            {/* Formulář je v DOM první — u QR/last-minute rezervace ze
                dveří ho tak má člověk rovnou pod hlavičkou, bez rolování
                přes seznam obsazenosti. */}
            {selectedRoom.permanent_occupant ? (
              <p className="viewer-notice">
                🔒 Trvale obsazeno — {selectedRoom.permanent_occupant}. Tahle
                místnost/stůl je vyhrazená natrvalo a nejde přes appku
                rezervovat. Pro uvolnění se ozvěte správci.
              </p>
            ) : (
              <>
            <h3>Nová rezervace</h3>
            {canBook ? (
              <form className="booking-form" onSubmit={handleBook}>
                <div>
                  <label htmlFor="date">Datum</label>
                  <input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="row">
                  <div>
                    <label htmlFor="start">Od</label>
                    <input
                      id="start"
                      type="time"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="end">Do</label>
                    <input
                      id="end"
                      type="time"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="purpose">Účel (nepovinné)</label>
                  <input
                    id="purpose"
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="např. porada týmu"
                  />
                </div>
                <div>
                  <label htmlFor="recurrence">Opakování</label>
                  <select
                    id="recurrence"
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                  >
                    <option value="none">Bez opakování</option>
                    <option value="weekly">Každý týden</option>
                    <option value="monthly">Jednou za měsíc</option>
                  </select>
                </div>
                {recurrence !== "none" && (
                  <div>
                    <label htmlFor="recurrenceEnd">Opakovat do (datum)</label>
                    <input
                      id="recurrenceEnd"
                      type="date"
                      value={recurrenceEnd}
                      min={date}
                      onChange={(e) => setRecurrenceEnd(e.target.value)}
                      required
                    />
                  </div>
                )}
                {formError && <p className="form-error">{formError}</p>}
                {formNotice && <p className="form-notice">{formNotice}</p>}
                <button type="submit" disabled={submitting}>
                  {submitting ? "Ukládám…" : "Zarezervovat"}
                </button>
              </form>
            ) : profile ? (
              <p className="viewer-notice">
                Váš účet má zatím jen právo na náhled. Rezervace může vytvářet
                osoba s právem &quot;rezervující&quot; nebo &quot;admin&quot; — o přidání
                práva požádejte správce v sekci Správa.
              </p>
            ) : (
              <p className="viewer-notice">
                Obsazenost vidíte i bez přihlášení. Pro vytvoření rezervace se
                prosím{" "}
                <a href={`/login?next=${encodeURIComponent(`/dashboard?room=${selectedRoomId}`)}`}>
                  přihlaste
                </a>{" "}
                (nebo si založte účet) — trvá to chvilku a appka vás vrátí
                rovnou zpátky sem.
              </p>
            )}
              </>
            )}

            <h3>Nadcházející rezervace</h3>
            {roomBookings.length === 0 && (
              <p style={{ fontSize: 13, color: "#55617a" }}>Zatím žádné rezervace.</p>
            )}
            {roomBookings.map((b) => renderBookingRow(b))}
          </div>
        </div>
      )}

      {showMyBookings && (
        <div
          className="panel-overlay"
          onClick={() => {
            setShowMyBookings(false);
            cancelEditBooking();
          }}
        >
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <div>
                <h2 className="font-display">Moje rezervace</h2>
                <p className="meta">
                  Všechny vaše nadcházející rezervace na jednom místě — zrušit
                  nebo posunout čas jde přímo tady, nemusíte hledat
                  konkrétní místnost.
                </p>
              </div>
              <button
                className="panel-close"
                onClick={() => {
                  setShowMyBookings(false);
                  cancelEditBooking();
                }}
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>
            {myBookings.length === 0 && (
              <p style={{ fontSize: 13, color: "#55617a" }}>
                Zatím nemáte žádnou nadcházející rezervaci.
              </p>
            )}
            {myBookings.map((b) => renderBookingRow(b, true))}
          </div>
        </div>
      )}

      {floorplanExpanded && (
        <div className="panel-overlay floorplan-modal-overlay" onClick={() => setFloorplanExpanded(false)}>
          <div className="floorplan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="floorplan-modal-head">
              <div className="floor-tabs">
                {FLOORS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={`btn floor-tab ${selectedFloor === f.value ? "active" : ""}`}
                    onClick={() => setSelectedFloor(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                className="panel-close"
                onClick={() => setFloorplanExpanded(false)}
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>
            <div className="floorplan-modal-scroll">
              <div
                className="floorplan has-bg floorplan-modal-canvas"
                style={{ aspectRatio: currentFloorInfo.aspect }}
              >
                {renderFloorplanContent()}
              </div>
            </div>
            <p className="floorplan-modal-hint">
              Pro přiblížení použijte gesto přiblížení prsty (pinch-to-zoom).
            </p>
          </div>
        </div>
      )}
    </>
  );
}
