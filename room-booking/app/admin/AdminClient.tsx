"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import type { Profile, Room, Booking, UserRole, RoomType } from "@/lib/types";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function AdminClient({
  profile,
  initialRooms,
  initialProfiles,
  initialBookings,
}: {
  profile: Profile;
  initialRooms: Room[];
  initialProfiles: Profile[];
  initialBookings: Booking[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [bookings, setBookings] = useState(initialBookings);
  const [newRoom, setNewRoom] = useState({
    name: "",
    type: "meeting_room" as RoomType,
    capacity: "",
    pos_x: "50",
    pos_y: "50",
  });
  const [busy, setBusy] = useState(false);

  const [hoursMonth, setHoursMonth] = useState(currentMonth);
  const [monthlyBookings, setMonthlyBookings] = useState<
    { user_id: string; starts_at: string; ends_at: string }[]
  >([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadMonth() {
      setHoursLoading(true);
      const supabase = createClient();
      const start = new Date(`${hoursMonth}-01T00:00:00`).toISOString();
      const [y, m] = hoursMonth.split("-").map(Number);
      const end = new Date(y, m, 1).toISOString(); // m je 1-indexované -> 1. den následujícího měsíce
      const { data } = await supabase
        .from("bookings")
        .select("user_id, starts_at, ends_at")
        .gte("starts_at", start)
        .lt("starts_at", end);
      if (!cancelled) {
        setMonthlyBookings(data ?? []);
        setHoursLoading(false);
      }
    }
    loadMonth();
    return () => {
      cancelled = true;
    };
  }, [hoursMonth]);

  const usageByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of monthlyBookings) {
      const hours =
        (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3600000;
      map.set(b.user_id, (map.get(b.user_id) ?? 0) + hours);
    }
    return map;
  }, [monthlyBookings]);

  function updateHoursLimitLocal(id: string, value: string) {
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, monthly_hours_limit: value === "" ? null : Number(value) }
          : p
      )
    );
  }

  async function saveHoursLimit(p: Profile) {
    const supabase = createClient();
    await supabase.rpc("admin_set_hours_limit", {
      target_user_id: p.id,
      new_limit: p.monthly_hours_limit,
    });
    await refresh();
  }

  const usersWithLimit = profiles.filter(
    (p) => p.monthly_hours_limit !== null && p.monthly_hours_limit !== undefined
  );

  async function refresh() {
    const supabase = createClient();
    const [{ data: r }, { data: p }, { data: b }] = await Promise.all([
      supabase.from("rooms").select("*").order("name"),
      supabase.from("profiles").select("*").order("email"),
      supabase
        .from("bookings")
        .select("*, profiles(email, full_name)")
        .order("starts_at", { ascending: false })
        .limit(100),
    ]);
    if (r) setRooms(r);
    if (p) setProfiles(p);
    if (b) setBookings(b as unknown as Booking[]);
  }

  function updateRoomField(id: string, field: keyof Room, value: string) {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  async function saveRoom(room: Room) {
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("rooms")
      .update({
        name: room.name,
        type: room.type,
        description: room.description,
        capacity: room.capacity === null ? null : Number(room.capacity),
        pos_x: Number(room.pos_x),
        pos_y: Number(room.pos_y),
      })
      .eq("id", room.id);
    setBusy(false);
    await refresh();
  }

  async function deleteRoom(id: string) {
    if (!confirm("Opravdu smazat tuto místnost i s jejími rezervacemi?")) return;
    const supabase = createClient();
    await supabase.from("rooms").delete().eq("id", id);
    await refresh();
  }

  async function addRoom() {
    if (!newRoom.name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("rooms").insert({
      name: newRoom.name,
      type: newRoom.type,
      capacity: newRoom.capacity ? Number(newRoom.capacity) : null,
      pos_x: Number(newRoom.pos_x),
      pos_y: Number(newRoom.pos_y),
    });
    setNewRoom({ name: "", type: "meeting_room", capacity: "", pos_x: "50", pos_y: "50" });
    setBusy(false);
    await refresh();
  }

  async function setRole(userId: string, role: UserRole) {
    const supabase = createClient();
    await supabase.rpc("admin_set_role", {
      target_user_id: userId,
      new_role: role,
    });
    await refresh();
  }

  async function deleteBooking(id: string) {
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("id", id);
    await refresh();
  }

  return (
    <>
      <Header profile={profile} />
      <div className="admin-wrap">
        <section className="admin-section">
          <h2 className="font-display">Místnosti a prostory</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Název</th>
                <th>Typ</th>
                <th>Kapacita</th>
                <th>Poloha X %</th>
                <th>Poloha Y %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td>
                    <input
                      value={room.name}
                      onChange={(e) => updateRoomField(room.id, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      value={room.type}
                      onChange={(e) => updateRoomField(room.id, "type", e.target.value)}
                    >
                      <option value="meeting_room">Zasedačka</option>
                      <option value="space">Prostor</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 64 }}
                      value={room.capacity ?? ""}
                      onChange={(e) => updateRoomField(room.id, "capacity", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 64 }}
                      value={room.pos_x}
                      onChange={(e) => updateRoomField(room.id, "pos_x", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 64 }}
                      value={room.pos_y}
                      onChange={(e) => updateRoomField(room.id, "pos_y", e.target.value)}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn primary" disabled={busy} onClick={() => saveRoom(room)}>
                      Uložit
                    </button>{" "}
                    <button className="btn danger" onClick={() => deleteRoom(room.id)}>
                      Smazat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="new-room-form">
            <div className="field">
              <label>Název</label>
              <input
                value={newRoom.name}
                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                placeholder="např. Zasedačka Alfa"
              />
            </div>
            <div className="field">
              <label>Typ</label>
              <select
                value={newRoom.type}
                onChange={(e) =>
                  setNewRoom({ ...newRoom, type: e.target.value as RoomType })
                }
              >
                <option value="meeting_room">Zasedačka</option>
                <option value="space">Prostor</option>
              </select>
            </div>
            <div className="field">
              <label>Kapacita</label>
              <input
                type="number"
                style={{ width: 70 }}
                value={newRoom.capacity}
                onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Poloha X / Y %</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  style={{ width: 56 }}
                  value={newRoom.pos_x}
                  onChange={(e) => setNewRoom({ ...newRoom, pos_x: e.target.value })}
                />
                <input
                  type="number"
                  style={{ width: 56 }}
                  value={newRoom.pos_y}
                  onChange={(e) => setNewRoom({ ...newRoom, pos_y: e.target.value })}
                />
              </div>
            </div>
            <button className="btn primary" disabled={busy} onClick={addRoom}>
              Přidat místnost
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#55617a", marginTop: 8 }}>
            Poloha X/Y určuje, kde se místnost zobrazí na půdorysu (0–100 %
            zleva doprava a shora dolů). Vyzkoušejte na Půdorysu a hodnoty
            doladíte.
          </p>
        </section>

        <section className="admin-section">
          <h2 className="font-display">Lidé a práva</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Role</th>
                <th>Limit hodin/měsíc</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>{p.email}</td>
                  <td>
                    <select
                      value={p.role}
                      onChange={(e) => setRole(p.id, e.target.value as UserRole)}
                    >
                      <option value="viewer">Jen náhled</option>
                      <option value="booker">Rezervující</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 70 }}
                      value={p.monthly_hours_limit ?? ""}
                      placeholder="bez limitu"
                      onChange={(e) => updateHoursLimitLocal(p.id, e.target.value)}
                      onBlur={() => saveHoursLimit(p)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "#55617a", marginTop: 8 }}>
            Noví lidé se objeví v tomto seznamu, jakmile se poprvé přihlásí
            e-mailem — do té doby v appce neexistují. Limit hodin je jen
            evidenční (měkký) — appka nikomu rezervaci kvůli němu nezablokuje,
            jen ukáže přečerpání níž v sekci Čerpání hodin.
          </p>
        </section>

        <section className="admin-section">
          <h2 className="font-display">Čerpání hodin</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#55617a", marginRight: 8 }}>
              Měsíc
            </label>
            <input
              type="month"
              value={hoursMonth}
              onChange={(e) => setHoursMonth(e.target.value)}
            />
            {hoursLoading && (
              <span style={{ fontSize: 12, color: "#55617a", marginLeft: 8 }}>
                Načítám…
              </span>
            )}
          </div>
          {usersWithLimit.length === 0 ? (
            <p style={{ fontSize: 13, color: "#55617a" }}>
              Zatím nikdo nemá nastavený měsíční limit hodin — nastavte ho výš
              v sekci „Lidé a práva".
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Limit (h)</th>
                  <th>Vyčerpáno (h)</th>
                  <th>Stav</th>
                </tr>
              </thead>
              <tbody>
                {usersWithLimit.map((p) => {
                  const used = usageByUser.get(p.id) ?? 0;
                  const limit = Number(p.monthly_hours_limit);
                  const over = Math.max(0, used - limit);
                  return (
                    <tr key={p.id}>
                      <td>{p.email}</td>
                      <td className="mono">{limit}</td>
                      <td className="mono">{used.toFixed(1)}</td>
                      <td>
                        {over > 0 ? (
                          <span style={{ color: "#b8721e", fontWeight: 600 }}>
                            +{over.toFixed(1)} h k doúčtování
                          </span>
                        ) : (
                          <span style={{ color: "#55617a" }}>v limitu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-section">
          <h2 className="font-display">Poslední rezervace</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Místnost</th>
                <th>Kdo</th>
                <th>Od</th>
                <th>Do</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{rooms.find((r) => r.id === b.room_id)?.name ?? "—"}</td>
                  <td>{b.profiles?.full_name || b.profiles?.email}</td>
                  <td className="mono">
                    {new Date(b.starts_at).toLocaleString("cs-CZ")}
                  </td>
                  <td className="mono">
                    {new Date(b.ends_at).toLocaleString("cs-CZ")}
                  </td>
                  <td>
                    <button className="btn danger" onClick={() => deleteBooking(b.id)}>
                      Smazat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
