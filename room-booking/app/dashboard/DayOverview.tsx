"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Room, Booking } from "@/lib/types";
import { addDaysLocalStr, startOfWeekLocalStr, toLocalDateStr, todayLocalStr } from "@/lib/date";

const WINDOW_START = 7; // 07:00
const WINDOW_END = 21; // 21:00

type ViewMode = "day" | "week";

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

export default function DayOverview({
  rooms,
  visibleRoomIds = null,
}: {
  rooms: Room[];
  // NULL = appka zobrazí všechny řádky (výchozí). Pole = uživatelova
  // skupina místností omezuje, které řádky se vůbec zobrazí — kódy
  // (R-06 apod.) se ale pořád počítají z plného seznamu `rooms`, ať
  // sedí s tím, co appka ukazuje jinde (Půdorys).
  visibleRoomIds?: string[] | null;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(todayLocalStr());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [rangeStart, rangeEnd, load]);

  function shiftRange(delta: number) {
    const step = viewMode === "week" ? delta * 7 : delta;
    setDate((d) => addDaysLocalStr(d, step));
  }

  const totalMinutes = (WINDOW_END - WINDOW_START) * 60;
  const hourCount = WINDOW_END - WINDOW_START;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => WINDOW_START + i);

  function pct(iso: string) {
    const d = new Date(iso);
    const minutes = (d.getHours() - WINDOW_START) * 60 + d.getMinutes();
    return Math.min(100, Math.max(0, (minutes / totalMinutes) * 100));
  }

  const today = todayLocalStr();
  const isToday = date === today;
  const now = new Date();
  const nowPct = Math.min(
    100,
    Math.max(0, (((now.getHours() - WINDOW_START) * 60 + now.getMinutes()) / totalMinutes) * 100)
  );

  const visibleRooms = visibleRoomIds ? rooms.filter((r) => visibleRoomIds.includes(r.id)) : rooms;

  function bookingsForRoomDay(roomId: string, dayStr: string) {
    return bookings
      .filter((b) => b.room_id === roomId && toLocalDateStr(new Date(b.starts_at)) === dayStr)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  return (
    <div className="overview-wrap">
      <div className="overview-header">
        <h2 className="font-display">
          {viewMode === "day" ? "Denní přehled — kdo, kde, kdy" : "Týdenní přehled — kdo, kde, kdy"}
        </h2>
        <div className="overview-mode-toggle">
          <button
            className={`btn overview-mode-btn ${viewMode === "day" ? "active" : ""}`}
            onClick={() => setViewMode("day")}
          >
            Den
          </button>
          <button
            className={`btn overview-mode-btn ${viewMode === "week" ? "active" : ""}`}
            onClick={() => setViewMode("week")}
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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

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
                <div className="overview-row-track">
                  {isToday && <div className="overview-now" style={{ left: `${nowPct}%` }} />}
                  {roomBookings.map((b) => {
                    const left = pct(b.starts_at);
                    const width = Math.max(pct(b.ends_at) - left, 1.5);
                    const who = b.profiles?.full_name || b.profiles?.email?.split("@")[0] || "";
                    return (
                      <div
                        key={b.id}
                        className={`overview-block ${room.type}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)} · ${who}${
                          b.purpose ? " · " + b.purpose : ""
                        }`}
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
                      <td key={d} className={`week-cell ${d === today ? "week-today" : ""}`}>
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
    </div>
  );
}
