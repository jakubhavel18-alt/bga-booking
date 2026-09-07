"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import DayOverview from "./DayOverview";
import type { Profile, Room, Booking } from "@/lib/types";

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

function roomCode(rooms: Room[], room: Room) {
  const idx = rooms.findIndex((r) => r.id === room.id);
  return `R-${String(idx + 1).padStart(2, "0")}`;
}

export default function DashboardClient({
  profile,
  initialRooms,
  initialBookings,
}: {
  profile: Profile | null;
  initialRooms: Room[];
  initialBookings: Booking[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [purpose, setPurpose] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canBook = profile?.role === "booker" || profile?.role === "admin";
  const now = Date.now();

  const meetingRooms = rooms.filter((r) => r.type === "meeting_room");
  const spaceRooms = rooms.filter((r) => r.type !== "meeting_room");

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

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

    const starts_at = new Date(`${date}T${start}:00`).toISOString();
    const ends_at = new Date(`${date}T${end}:00`).toISOString();

    if (new Date(ends_at) <= new Date(starts_at)) {
      setFormError("Konec musí být po začátku.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("bookings").insert({
      room_id: selectedRoomId,
      user_id: profile.id,
      starts_at,
      ends_at,
      purpose: purpose || null,
    });
    setSubmitting(false);

    if (error) {
      if (error.message.toLowerCase().includes("exclude") || error.code === "23P01") {
        setFormError("V tomto čase je místnost už obsazená.");
      } else {
        setFormError("Rezervaci se nepodařilo uložit. Zkuste to znovu.");
      }
      return;
    }

    setPurpose("");
    await refresh();
  }

  async function handleCancel(bookingId: string) {
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("id", bookingId);
    await refresh();
  }

  return (
    <>
      <Header profile={profile} />

      <div className="floorplan-wrap">
        <div className="floorplan">
          {rooms.map((room) => {
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
            {rooms.length === 0 && (
              <p style={{ color: "#55617a", fontSize: 14 }}>
                Zatím tu nejsou žádné místnosti. Admin je může přidat v sekci Správa.
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

      <DayOverview rooms={rooms} />

      {selectedRoom && (
        <div className="panel-overlay" onClick={() => setSelectedRoomId(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <button className="panel-close" onClick={() => setSelectedRoomId(null)} aria-label="Zavřít">
              ×
            </button>
            <h2 className="font-display">{selectedRoom.name}</h2>
            <p className="meta">
              {selectedRoom.type === "meeting_room" ? "Zasedačka" : "Prostor"}
              {selectedRoom.capacity ? ` · kapacita ${selectedRoom.capacity}` : ""}
              {selectedRoom.description ? ` · ${selectedRoom.description}` : ""}
            </p>

            <h3>Nadcházející rezervace</h3>
            {roomBookings.length === 0 && (
              <p style={{ fontSize: 13, color: "#55617a" }}>Zatím žádné rezervace.</p>
            )}
            {roomBookings.map((b) => (
              <div className="booking-row" key={b.id}>
                <div>
                  <div className="time">
                    {fmtDay(b.starts_at)} · {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                  </div>
                  <div className="who">
                    {b.profiles?.full_name || b.profiles?.email || "Neznámý"}
                    {b.purpose ? ` — ${b.purpose}` : ""}
                  </div>
                </div>
                {(b.user_id === profile?.id || profile?.role === "admin") && (
                  <button className="cancel" onClick={() => handleCancel(b.id)}>
                    Zrušit
                  </button>
                )}
              </div>
            ))}

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
                {formError && <p className="form-error">{formError}</p>}
                <button type="submit" disabled={submitting}>
                  {submitting ? "Ukládám…" : "Zarezervovat"}
                </button>
              </form>
            ) : (
              <p className="viewer-notice">
                Váš účet má zatím jen právo na náhled. Rezervace může vytvářet
                osoba s právem &quot;rezervující&quot; nebo &quot;admin&quot; — o přidání
                práva požádejte správce v sekci Správa.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
