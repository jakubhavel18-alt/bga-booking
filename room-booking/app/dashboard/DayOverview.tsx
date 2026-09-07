"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Room, Booking } from "@/lib/types";

const WINDOW_START = 7; // 07:00
const WINDOW_END = 21; // 21:00

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [date, setDate] = useState(todayIso());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const supabase = createClient();
    const dayStart = new Date(`${d}T00:00:00`).toISOString();
    const dayEnd = new Date(`${d}T23:59:59`).toISOString();
    const { data } = await supabase
      .from("bookings")
      .select("*, profiles(email, full_name)")
      .lt("starts_at", dayEnd)
      .gt("ends_at", dayStart)
      .order("starts_at");
    setBookings((data as unknown as Booking[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  function shiftDay(delta: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  const totalMinutes = (WINDOW_END - WINDOW_START) * 60;
  const hourCount = WINDOW_END - WINDOW_START;
  const hours = Array.from({ length: hourCount + 1 }, (_, i) => WINDOW_START + i);

  function pct(iso: string) {
    const d = new Date(iso);
    const minutes = (d.getHours() - WINDOW_START) * 60 + d.getMinutes();
    return Math.min(100, Math.max(0, (minutes / totalMinutes) * 100));
  }

  const isToday = date === todayIso();
  const now = new Date();
  const nowPct = Math.min(
    100,
    Math.max(0, (((now.getHours() - WINDOW_START) * 60 + now.getMinutes()) / totalMinutes) * 100)
  );

  return (
    <div className="overview-wrap">
      <div className="overview-header">
        <h2 className="font-display">Denní přehled — kdo, kde, kdy</h2>
        <div className="overview-nav">
          <button className="btn overview-nav-btn" onClick={() => shiftDay(-1)} aria-label="Předchozí den">
            ◀
          </button>
          <button className="btn overview-nav-btn" onClick={() => setDate(todayIso())}>
            Dnes
          </button>
          <button className="btn overview-nav-btn" onClick={() => shiftDay(1)} aria-label="Další den">
            ▶
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

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

        {(visibleRoomIds ? rooms.filter((r) => visibleRoomIds.includes(r.id)) : rooms).map((room) => {
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

        {(visibleRoomIds ? rooms.filter((r) => visibleRoomIds.includes(r.id)) : rooms).length === 0 && (
          <p style={{ color: "#55617a", fontSize: 14, padding: "12px 16px" }}>
            {rooms.length === 0
              ? "Zatím nejsou žádné místnosti."
              : "Pro váš účet zatím nejsou přiřazené žádné místnosti."}
          </p>
        )}
      </div>
      {loading && <p style={{ fontSize: 12, color: "#55617a", marginTop: 6 }}>Načítám…</p>}
    </div>
  );
}
