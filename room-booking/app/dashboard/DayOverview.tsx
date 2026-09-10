"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Room, Booking } from "@/lib/types";
import { addDaysLocalStr, startOfWeekLocalStr, toLocalDateStr, todayLocalStr } from "@/lib/date";

const WINDOW_START = 7; // 07:00
const WINDOW_END = 21; // 21:00
const TOTAL_MINUTES = (WINDOW_END - WINDOW_START) * 60;
// Výchozí délka nové rezervace založené klikem v přehledu.
const DEFAULT_DURATION_MIN = 60;
// Přetažením i klikem se čas zaokrouhluje na tohle — ať netrefíte
// "13:03" omylem místo "13:00".
const SNAP_MIN = 15;

type ViewMode = "day" | "week";

type DragState = {
  bookingId: string;
  startClientX: number;
  origStartMs: number;
  durationMs: number;
  moved: boolean;
  previewStartMs: number;
  previewEndMs: number;
};

function roomCode(rooms: Room[], room: Room) {
  const idx = rooms.findIndex((r) => r.id === room.id);
  return `R-${String(idx + 1).padStart(2, "0")}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDayHeader(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
}

function minutesToTime(totalMin: number) {
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export default function DayOverview({
  rooms,
  visibleRoomIds = null,
  currentUserId = null,
  isAdmin = false,
  onCreateBooking,
  onBookingsChanged,
  refreshKey = 0,
}: {
  rooms: Room[];
  // NULL = appka zobrazí všechny řádky (výchozí). Pole = uživatelova
  // skupina místností omezuje, které řádky se vůbec zobrazí — kódy
  // (R-06 apod.) se ale pořád počítají z plného seznamu `rooms`, ať
  // sedí s tím, co appka ukazuje jinde (Půdorys).
  visibleRoomIds?: string[] | null;
  // Kdo se dívá — ať appka pozná, které rezervace smí přetáhnout/zrušit
  // přímo tady v přehledu (vlastní, nebo cokoliv jako admin).
  currentUserId?: string | null;
  isAdmin?: boolean;
  // Klik na volné místo v kalendáři ("okno") — appka otevře panel dané
  // místnosti s předvyplněným datem a časem, jako v Google Calendari.
  onCreateBooking?: (roomId: string, dateStr: string, startTime: string, endTime: string) => void;
  // Zavolá se po úspěšném přesunu/zrušení rezervace přímo z přehledu, ať
  // se přenačte i zbytek appky (obsazenost na půdorysu, Moje rezervace…).
  onBookingsChanged?: () => void;
  // Zvýší se odjinud v appce po založení/zrušení/úpravě rezervace — ať
  // se i tenhle přehled přenačte, bez nutnosti přepnout den tam a zpět.
  refreshKey?: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(todayLocalStr());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  // Otevřená "bublina" s detailem rezervace (kdo, popis, čas) po kliknutí
  // na termín — hlavně pro mobil, kde na title tooltip nikdo neklikne.
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeekLocalStr(date), [date]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysLocalStr(weekStart, i)),
    [weekStart]
  );

  const rangeStart = viewMode === "week" ? weekStart : date;
  const rangeEnd = viewMode === "week" ? weekDates[6] : date;

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    const supabase = createClient();
    const rangeStartIso = new Date(`${start}T00:00:00`).toISOString();
    const rangeEndIso = new Date(`${end}T23:59:59`).toISOString();
    const { data } = await supabase
      .from("bookings")
      .select("*, profiles(email, full_name)")
      .lt("starts_at", rangeEndIso)
      .gt("ends_at", rangeStartIso)
      .order("starts_at");
    setBookings((data as unknown as Booking[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(rangeStart, rangeEnd);
  }, [rangeStart, rangeEnd, load, refreshKey]);

  // Rozdělaný drag se týká konkrétní rezervace — refy, ať pointerup vždy
  // vidí poslední pozici z pointermove (ne zastaralou z uzávěru).
  const draggingRef = useRef<DragState | null>(null);

  function shiftRange(delta: number) {
    const step = viewMode === "week" ? delta * 7 : delta;
    setDate((d) => addDaysLocalStr(d, step));
  }

  const hourCount = WINDOW_END - WINDOW_START;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => WINDOW_START + i);

  function pct(iso: string) {
    const d = new Date(iso);
    const minutes = (d.getHours() - WINDOW_START) * 60 + d.getMinutes();
    return Math.min(100, Math.max(0, (minutes / TOTAL_MINUTES) * 100));
  }

  const today = todayLocalStr();
  const isToday = date === today;
  const now = new Date();
  const nowPct = Math.min(
    100,
    Math.max(0, (((now.getHours() - WINDOW_START) * 60 + now.getMinutes()) / TOTAL_MINUTES) * 100)
  );

  const visibleRooms = visibleRoomIds ? rooms.filter((r) => visibleRoomIds.includes(r.id)) : rooms;

  function bookingsForRoomDay(roomId: string, dayStr: string) {
    return bookings
      .filter((b) => b.room_id === roomId && toLocalDateStr(new Date(b.starts_at)) === dayStr)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  function canManageBooking(b: Booking) {
    return isAdmin || (currentUserId !== null && b.user_id === currentUserId);
  }

  // Klik na volné místo v řádku dané místnosti — spočítá čas podle
  // vodorovné pozice kliknutí a otevře rezervaci na ten čas (zaokrouhleno
  // na SNAP_MIN). Rezervace uvnitř řádku mají vlastní onClick se
  // stopPropagation, takže sem se probublá jen klik do prázdna.
  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>, room: Room) {
    if (!onCreateBooking) return;
    setDetailBookingId(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const rawMin = p * TOTAL_MINUTES;
    const snappedMin = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
    const startTotalMin = Math.min(
      WINDOW_START * 60 + snappedMin,
      WINDOW_END * 60 - SNAP_MIN
    );
    const endTotalMin = Math.min(startTotalMin + DEFAULT_DURATION_MIN, WINDOW_END * 60);
    onCreateBooking(room.id, date, minutesToTime(startTotalMin), minutesToTime(endTotalMin));
  }

  function handleWeekCellClick(room: Room, dayStr: string, hasBookings: boolean) {
    if (!onCreateBooking || hasBookings) return;
    onCreateBooking(room.id, dayStr, "09:00", "10:00");
  }

  function handleBlockPointerDown(e: ReactPointerEvent<HTMLDivElement>, b: Booking) {
    e.stopPropagation();
    if (!canManageBooking(b)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const origStartMs = new Date(b.starts_at).getTime();
    const origEndMs = new Date(b.ends_at).getTime();
    draggingRef.current = {
      bookingId: b.id,
      startClientX: e.clientX,
      origStartMs,
      durationMs: origEndMs - origStartMs,
      moved: false,
      previewStartMs: origStartMs,
      previewEndMs: origEndMs,
    };
  }

  function handleTrackPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const dragging = draggingRef.current;
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const deltaPx = e.clientX - dragging.startClientX;
    if (Math.abs(deltaPx) > 4) dragging.moved = true;
    const deltaMin = (deltaPx / rect.width) * TOTAL_MINUTES;
    const snappedDeltaMin = Math.round(deltaMin / SNAP_MIN) * SNAP_MIN;

    const dayBaseMs = new Date(`${date}T00:00:00`).getTime();
    const windowStartMs = dayBaseMs + WINDOW_START * 3600000;
    const windowEndMs = dayBaseMs + WINDOW_END * 3600000;

    let newStart = dragging.origStartMs + snappedDeltaMin * 60000;
    let newEnd = newStart + dragging.durationMs;
    if (newStart < windowStartMs) {
      newStart = windowStartMs;
      newEnd = newStart + dragging.durationMs;
    }
    if (newEnd > windowEndMs) {
      newEnd = windowEndMs;
      newStart = newEnd - dragging.durationMs;
    }
    dragging.previewStartMs = newStart;
    dragging.previewEndMs = newEnd;

    setBookings((prev) =>
      prev.map((b) =>
        b.id === dragging.bookingId
          ? { ...b, starts_at: new Date(newStart).toISOString(), ends_at: new Date(newEnd).toISOString() }
          : b
      )
    );
  }

  async function handleTrackPointerUp() {
    const dragging = draggingRef.current;
    if (!dragging) return;
    draggingRef.current = null;

    if (!dragging.moved) {
      // Bylo to jen klepnutí, ne přetažení — ukázat detail rezervace.
      setDetailBookingId(dragging.bookingId);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("bookings")
      .update({
        starts_at: new Date(dragging.previewStartMs).toISOString(),
        ends_at: new Date(dragging.previewEndMs).toISOString(),
      })
      .eq("id", dragging.bookingId);

    if (error) {
      setDragError(
        error.message.toLowerCase().includes("exclude") || error.code === "23P01"
          ? "V tomto čase je místnost už obsazená — přetažení se nepovedlo."
          : "Přesun se nepodařilo uložit."
      );
      await load(rangeStart, rangeEnd); // vrátit zpátky podle serveru
    } else {
      setDragError(null);
      onBookingsChanged?.();
    }
  }

  function handleTrackPointerCancel() {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    load(rangeStart, rangeEnd);
  }

  async function handleDetailCancel(bookingId: string) {
    if (!confirm("Zrušit tuhle rezervaci?")) return;
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("id", bookingId);
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setDetailBookingId(null);
    onBookingsChanged?.();
  }

  const detailBooking = detailBookingId ? bookings.find((b) => b.id === detailBookingId) ?? null : null;

  return (
    <div className="overview-wrap">
      <div className="overview-header">
        <h2 className="font-display">
          {viewMode === "day" ? "Denní přehled — kdo, kde, kdy" : "Týdenní přehled — kdo, kde, kdy"}
        </h2>
        <div className="overview-mode-toggle">
          <button
            className={`btn overview-mode-btn ${viewMode === "day" ? "active" : ""}`}
            onClick={() => {
              setViewMode("day");
              setDetailBookingId(null);
            }}
          >
            Den
          </button>
          <button
            className={`btn overview-mode-btn ${viewMode === "week" ? "active" : ""}`}
            onClick={() => {
              setViewMode("week");
              setDetailBookingId(null);
            }}
          >
            Týden
          </button>
        </div>
        <div className="overview-nav">
          <button
            className="btn overview-nav-btn"
            onClick={() => shiftRange(-1)}
            aria-label={viewMode === "week" ? "Předchozí týden" : "Předchozí den"}
          >
            ◀
          </button>
          <button className="btn overview-nav-btn" onClick={() => setDate(todayLocalStr())}>
            Dnes
          </button>
          <button
            className="btn overview-nav-btn"
            onClick={() => shiftRange(1)}
            aria-label={viewMode === "week" ? "Další týden" : "Další den"}
          >
            ▶
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDetailBookingId(null);
            }}
          />
        </div>
      </div>

      {viewMode === "day" && onCreateBooking && (
        <p className="overview-hint">
          Klikněte na volné místo v kalendáři a rovnou tam založíte rezervaci. Vlastní
          termín jde přetáhnout na jiný čas, klikem na něj zobrazíte kdo a proč ho má.
        </p>
      )}

      {dragError && (
        <p className="form-error" style={{ marginTop: 6 }}>
          {dragError}{" "}
          <button className="btn" style={{ marginLeft: 6 }} onClick={() => setDragError(null)}>
            OK
          </button>
        </p>
      )}

      {viewMode === "day" ? (
        <div className="overview-grid">
          <div className="overview-hours">
            <div className="overview-row-label" />
            <div className="overview-row-track">
              {hours.map((h) => (
                <span
                  key={h}
                  className="overview-hour"
                  style={{ left: `${((h - WINDOW_START) / hourCount) * 100}%` }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          {visibleRooms.map((room) => {
            const roomBookings = bookings.filter((b) => b.room_id === room.id);
            return (
              <div className="overview-row" key={room.id}>
                <div className="overview-row-label">
                  <span className="code">{roomCode(rooms, room)}</span>
                  {room.name}
                </div>
                <div
                  className="overview-row-track overview-row-track-interactive"
                  onClick={(e) => handleTrackClick(e, room)}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerCancel}
                >
                  {isToday && <div className="overview-now" style={{ left: `${nowPct}%` }} />}
                  {roomBookings.map((b) => {
                    const left = pct(b.starts_at);
                    const width = Math.max(pct(b.ends_at) - left, 1.5);
                    const who = b.profiles?.full_name || b.profiles?.email?.split("@")[0] || "";
                    const manageable = canManageBooking(b);
                    return (
                      <div
                        key={b.id}
                        className={`overview-block ${room.type} ${manageable ? "draggable" : ""}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} · ${who}${
                          b.purpose ? " · " + b.purpose : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => handleBlockPointerDown(e, b)}
                      >
                        <span className="overview-block-label">{who}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {visibleRooms.length === 0 && (
            <p style={{ color: "#55617a", fontSize: 14, padding: "12px 16px" }}>
              {rooms.length === 0
                ? "Zatím nejsou žádné místnosti."
                : "Pro váš účet zatím nejsou přiřazené žádné místnosti."}
            </p>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table week-table">
            <thead>
              <tr>
                <th>Místnost</th>
                {weekDates.map((d) => (
                  <th key={d} className={d === today ? "week-today" : ""}>
                    {fmtDayHeader(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRooms.map((room) => (
                <tr key={room.id}>
                  <td className="week-room-label">
                    <span className="code">{roomCode(rooms, room)}</span> {room.name}
                  </td>
                  {weekDates.map((d) => {
                    const dayBookings = bookingsForRoomDay(room.id, d);
                    return (
                      <td
                        key={d}
                        className={`week-cell ${d === today ? "week-today" : ""} ${
                          onCreateBooking && dayBookings.length === 0 ? "week-cell-clickable" : ""
                        }`}
                        onClick={() => handleWeekCellClick(room, d, dayBookings.length > 0)}
                      >
                        {dayBookings.length === 0 ? (
                          <span className="week-cell-empty">—</span>
                        ) : (
                          dayBookings.map((b) => {
                            const who =
                              b.profiles?.full_name || b.profiles?.email?.split("@")[0] || "";
                            return (
                              <div
                                key={b.id}
                                className={`week-cell-booking ${room.type}`}
                                title={`${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} · ${who}${
                                  b.purpose ? " · " + b.purpose : ""
                                }`}
                              >
                                {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                                <br />
                                {who}
                                {b.purpose && (
                                  <>
                                    <br />
                                    <span className="week-cell-purpose">{b.purpose}</span>
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {visibleRooms.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "#55617a" }}>
                    {rooms.length === 0
                      ? "Zatím nejsou žádné místnosti."
                      : "Pro váš účet zatím nejsou přiřazené žádné místnosti."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {loading && <p style={{ fontSize: 12, color: "#55617a", marginTop: 6 }}>Načítám…</p>}

      {detailBooking && (
        <div className="overview-detail-overlay" onClick={() => setDetailBookingId(null)}>
          <div className="overview-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="overview-detail-time">
              {fmtTime(detailBooking.starts_at)}–{fmtTime(detailBooking.ends_at)}
            </div>
            <div className="overview-detail-who">
              {detailBooking.profiles?.full_name || detailBooking.profiles?.email || "Neznámý"}
            </div>
            {detailBooking.purpose && (
              <div className="overview-detail-purpose">{detailBooking.purpose}</div>
            )}
            <div className="overview-detail-actions">
              {canManageBooking(detailBooking) && (
                <button className="cancel" onClick={() => handleDetailCancel(detailBooking.id)}>
                  Zrušit rezervaci
                </button>
              )}
              <button className="btn" onClick={() => setDetailBookingId(null)}>
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
