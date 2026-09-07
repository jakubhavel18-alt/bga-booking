"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import DayOverview from "./DayOverview";
import type { Profile, Room, Booking, FloorplanLabel } from "@/lib/types";

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
  const d = new Date(`${dateStr}T00:00:00`);
  if (freq === "weekly") {
    d.setDate(d.getDate() + 7 * n);
  } else {
    d.setMonth(d.getMonth() + n);
  }
  return d.toISOString().slice(0, 10);
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
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState(() => roundedTime(new Date()));
  const [end, setEnd] = useState(() => roundedTime(new Date(Date.now() + 60 * 60000)));
  const [purpose, setPurpose] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Při otevření jiné místnosti (nebo zavření panelu) smažeme hlášky
  // z předchozí rezervace, ať tam nevisí zpráva ke špatné místnosti.
  useEffect(() => {
    setFormError(null);
    setFormNotice(null);
  }, [selectedRoomId]);

  // Dokud je panel otevřený (typicky přes celou obrazovku na telefonu),
  // uzamkneme scroll stránky pod ním — jinak se na mobilu snadno rozjede
  // "dvojitý" scroll (panel + stránka pod ním) a celé to nepříjemně poskakuje.
  useEffect(() => {
    if (selectedRoomId) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [selectedRoomId]);

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

  const meetingRooms = visibleRooms.filter((r) => r.type === "meeting_room");
  const spaceRooms = visibleRooms.filter((r) => r.type !== "meeting_room");

  const selectedRoom = visibleRooms.find((r) => r.id === selectedRoomId) ?? null;

  const roomBookings = useMemo(() => {
    if (!selectedRoomId) return [];
    return bookings
      .filter((b) => b.room_id === selectedRoomId)
      .filter((b) => new Date(b.ends_at).getTime() > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [bookings, selectedRoomId, now]);

  function isOccupiedNow(roomId: string) {
    return bookings.some(
      (b) =>
        b.room_id === roomId &&
        new Date(b.starts_at).getTime() <= now &&
        new Date(b.ends_at).getTime() > now
    );
  }

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
  }

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!selectedRoomId || !profile) return;
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

  return (
    <>
      <Header profile={profile} />

      <div className="floorplan-wrap">
        <div className="floorplan">
          {visibleRooms.map((room) => {
            const occupied = isOccupiedNow(room.id);
            return (
              <button
                key={room.id}
                className={`room-box ${room.type} ${occupied ? "occupied" : ""}`}
                style={{ left: `${room.pos_x}%`, top: `${room.pos_y}%` }}
                onClick={() => setSelectedRoomId(room.id)}
              >
                <span className="code">{roomCode(rooms, room)}</span>
                <span className="name">
                  <span className={`status-dot ${occupied ? "busy" : "free"}`} />
                  {room.name}
                </span>
              </button>
            );
          })}
          {labels.map((label) => (
            <span
              key={label.id}
              className="floorplan-label"
              style={{ left: `${label.pos_x}%`, top: `${label.pos_y}%` }}
            >
              {label.text}
            </span>
          ))}
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
                  {isOccupiedNow(room.id) ? "🔶" : "🟢"} {room.name}
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
              <summary>Cowork a další prostory ({spaceRooms.length})</summary>
              <div className="room-list">
                {spaceRooms.map((room) => (
                  <button
                    key={room.id}
                    className="room-list-card"
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    <span className="code">{roomCode(rooms, room)} · prostor</span>
                    <div className="name">
                      {isOccupiedNow(room.id) ? "🔶" : "🟢"} {room.name}
                    </div>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <DayOverview rooms={rooms} visibleRoomIds={restrictedRoomIds} />

      {selectedRoom && (
        <div className="panel-overlay" onClick={() => setSelectedRoomId(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head">
              <div>
                <h2 className="font-display">{selectedRoom.name}</h2>
                <p className="meta">
                  {selectedRoom.type === "meeting_room" ? "Zasedačka" : "Prostor"}
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

            <h3>Nadcházející rezervace</h3>
            {roomBookings.length === 0 && (
              <p style={{ fontSize: 13, color: "#55617a" }}>Zatím žádné rezervace.</p>
            )}
            {roomBookings.map((b) => (
              <div className="booking-row" key={b.id}>
                <div>
                  <div className="time">
                    {fmtDay(b.starts_at)} · {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                    {b.recurrence_group_id && <span className="recurrence-tag"> · opakuje se</span>}
                  </div>
                  <div className="who">
                    {b.profiles?.full_name || b.profiles?.email || "Neznámý"}
                    {b.purpose ? ` — ${b.purpose}` : ""}
                  </div>
                </div>
                {(b.user_id === profile?.id || profile?.role === "admin") && (
                  <div className="booking-row-actions">
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
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
