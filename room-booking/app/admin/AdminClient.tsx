"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import type { Profile, Room, Booking, UserRole, RoomType } from "@/lib/types";

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
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "#55617a", marginTop: 8 }}>
            Noví lidé se objeví v tomto seznamu, jakmile se poprvé přihlásí
            e-mailem — do té doby v appce neexistují.
          </p>
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
