"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import type { Profile, Room, Booking, UserRole, RoomType, RoomGroup } from "@/lib/types";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function AdminClient({
  profile,
  initialRooms,
  initialProfiles,
  initialBookings,
  initialRoomGroups,
  initialRoomGroupRooms,
}: {
  profile: Profile;
  initialRooms: Room[];
  initialProfiles: Profile[];
  initialBookings: Booking[];
  initialRoomGroups: RoomGroup[];
  initialRoomGroupRooms: { group_id: string; room_id: string }[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [bookings, setBookings] = useState(initialBookings);
  const [roomGroups, setRoomGroups] = useState(initialRoomGroups);
  const [roomGroupRooms, setRoomGroupRooms] = useState(initialRoomGroupRooms);
  const [newGroupName, setNewGroupName] = useState("");
  // Adresa appky zjistíme až v prohlížeči (na serveru při vykreslení
  // stránky window neexistuje) — potřebujeme ji pro odkaz/QR kód místnosti.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
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
    { id: string; user_id: string; room_id: string; starts_at: string; ends_at: string; purpose: string | null }[]
  >([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  // Které uživatele má rozkliknuté "Zobrazit rezervace" v Čerpání hodin.
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  // Filtr "Kdo" nad tabulkou Poslední rezervace.
  const [bookingsFilterUserId, setBookingsFilterUserId] = useState<string>("all");

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
        .select("id, user_id, room_id, starts_at, ends_at, purpose")
        .gte("starts_at", start)
        .lt("starts_at", end)
        .order("starts_at");
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

  // Limit hodin je jen pro zasedačky — rezervace cowork prostorů se do
  // vyčerpaného limitu nepočítají.
  const meetingRoomIds = useMemo(
    () => new Set(rooms.filter((r) => r.type === "meeting_room").map((r) => r.id)),
    [rooms]
  );

  const usageByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of monthlyBookings) {
      if (!meetingRoomIds.has(b.room_id)) continue;
      const hours =
        (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3600000;
      map.set(b.user_id, (map.get(b.user_id) ?? 0) + hours);
    }
    return map;
  }, [monthlyBookings, meetingRoomIds]);

  function roomName(id: string) {
    return rooms.find((r) => r.id === id)?.name ?? "—";
  }

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
    const [{ data: r }, { data: p }, { data: b }, { data: g }, { data: gr }] = await Promise.all([
      supabase.from("rooms").select("*").order("name"),
      supabase.from("profiles").select("*").order("email"),
      supabase
        .from("bookings")
        .select("*, profiles(email, full_name)")
        .order("starts_at", { ascending: false })
        .limit(100),
      supabase.from("room_groups").select("*").order("name"),
      supabase.from("room_group_rooms").select("group_id, room_id"),
    ]);
    if (r) setRooms(r);
    if (p) setProfiles(p);
    if (b) setBookings(b as unknown as Booking[]);
    if (g) setRoomGroups(g);
    if (gr) setRoomGroupRooms(gr);
  }

  async function addRoomGroup() {
    if (!newGroupName.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("room_groups").insert({ name: newGroupName.trim() });
    setNewGroupName("");
    setBusy(false);
    await refresh();
  }

  async function deleteRoomGroup(id: string) {
    if (!confirm("Smazat tuhle skupinu? Lidem s touhle skupinou appka pak zase ukáže vše.")) return;
    const supabase = createClient();
    await supabase.from("room_groups").delete().eq("id", id);
    await refresh();
  }

  async function toggleRoomInGroup(groupId: string, roomId: string, include: boolean) {
    const supabase = createClient();
    if (include) {
      await supabase.from("room_group_rooms").insert({ group_id: groupId, room_id: roomId });
    } else {
      await supabase
        .from("room_group_rooms")
        .delete()
        .eq("group_id", groupId)
        .eq("room_id", roomId);
    }
    await refresh();
  }

  async function setUserRoomGroup(userId: string, groupId: string | null) {
    const supabase = createClient();
    await supabase.rpc("admin_set_room_group", {
      target_user_id: userId,
      new_group_id: groupId,
    });
    await refresh();
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

  async function deleteBookingSeries(groupId: string) {
    if (!confirm("Zrušit všechny termíny téhle opakované rezervace?")) return;
    const supabase = createClient();
    await supabase.from("bookings").delete().eq("recurrence_group_id", groupId);
    await refresh();
  }

  return (
    <>
      <Header profile={profile} />
      <div className="admin-wrap">
        <section className="admin-section">
          <h2 className="font-display">Místnosti a prostory</h2>
          <div className="table-scroll">
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
          </div>

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
          <h2 className="font-display">QR kódy pro rezervaci od dveří</h2>
          <p style={{ fontSize: 13, color: "#55617a", marginBottom: 16 }}>
            Vytiskněte a nalepte u konkrétní místnosti. Naskenování otevře
            appku rovnou na rezervaci téhle místnosti a předvyplní čas „teď" —
            pro last-minute rezervaci z telefonu tak stačí pár klepnutí.
          </p>
          <div className="qr-grid">
            {rooms.map((room) => {
              const roomUrl = origin ? `${origin}/dashboard?room=${room.id}` : "";
              const qrSrc = roomUrl
                ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(roomUrl)}`
                : "";
              return (
                <div className="qr-card" key={room.id}>
                  <div className="qr-card-name">{room.name}</div>
                  {qrSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrSrc} alt={`QR kód – ${room.name}`} width={160} height={160} />
                  ) : (
                    <div style={{ width: 160, height: 160 }} />
                  )}
                  {roomUrl && (
                    <a
                      className="qr-card-link"
                      href={qrSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Otevřít QR (uložte obrázek)
                    </a>
                  )}
                </div>
              );
            })}
            {rooms.length === 0 && (
              <p style={{ fontSize: 13, color: "#55617a" }}>
                Nejdřív přidejte místnosti výše.
              </p>
            )}
          </div>
        </section>

        <section className="admin-section">
          <h2 className="font-display">Lidé a práva</h2>
          <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Role</th>
                <th>Limit hodin/měsíc</th>
                <th>Skupina místností</th>
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
                  <td>
                    <select
                      value={p.room_group_id ?? ""}
                      onChange={(e) => setUserRoomGroup(p.id, e.target.value || null)}
                    >
                      <option value="">Vše (výchozí)</option>
                      {roomGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: 12, color: "#55617a", marginTop: 8 }}>
            Noví lidé se objeví v tomto seznamu, jakmile se poprvé přihlásí
            e-mailem — do té doby v appce neexistují. Limit hodin je jen
            evidenční (měkký) — appka nikomu rezervaci kvůli němu nezablokuje,
            jen ukáže přečerpání níž v sekci Čerpání hodin. Skupina místností
            omezuje, co danému člověku appka vůbec ukáže na Půdorysu a
            v Denním přehledu — skupiny se zakládají a nastavují níž v sekci
            „Skupiny místností". Admin vidí vždycky vše bez ohledu na skupinu.
          </p>
        </section>

        <section className="admin-section">
          <h2 className="font-display">Skupiny místností</h2>
          <p style={{ fontSize: 13, color: "#55617a", marginBottom: 16 }}>
            Pro lidi, kteří nemají vidět všechno — např. skupina „Fixní
            místo" pro lidi, co mají svůj stálý stůl a cowork prostory pro ně
            nedávají smysl, jen zasedačky a Velký sál. Kdo nemá skupinu
            přiřazenou (viz „Lidé a práva" výš), appka mu dál ukazuje úplně
            vše — beze změny.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="např. Fixní místo"
            />
            <button className="btn primary" disabled={busy} onClick={addRoomGroup}>
              Přidat skupinu
            </button>
          </div>
          {roomGroups.length === 0 ? (
            <p style={{ fontSize: 13, color: "#55617a" }}>
              Zatím žádná skupina — bez ní appka všem ukazuje vše.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Místnost</th>
                    {roomGroups.map((g) => (
                      <th key={g.id}>
                        {g.name}{" "}
                        <button
                          className="btn danger"
                          style={{ padding: "2px 6px", fontSize: 11 }}
                          onClick={() => deleteRoomGroup(g.id)}
                        >
                          smazat
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td>
                        {room.name}{" "}
                        <span style={{ color: "#55617a", fontSize: 11 }}>
                          ({room.type === "meeting_room" ? "zasedačka" : "prostor"})
                        </span>
                      </td>
                      {roomGroups.map((g) => {
                        const included = roomGroupRooms.some(
                          (gr) => gr.group_id === g.id && gr.room_id === room.id
                        );
                        return (
                          <td key={g.id} style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={(e) => toggleRoomInGroup(g.id, room.id, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-section">
          <h2 className="font-display">Čerpání hodin</h2>
          <p style={{ fontSize: 12, color: "#55617a", marginTop: -4, marginBottom: 12 }}>
            Počítají se jen rezervace zasedaček — cowork a další prostory se
            do limitu nepočítají.
          </p>
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
            <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Limit (h)</th>
                  <th>Vyčerpáno (h)</th>
                  <th>Stav</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usersWithLimit.map((p) => {
                  const used = usageByUser.get(p.id) ?? 0;
                  const limit = Number(p.monthly_hours_limit);
                  const over = Math.max(0, used - limit);
                  const userBookingsThisMonth = monthlyBookings
                    .filter((b) => b.user_id === p.id)
                    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
                  const isExpanded = expandedUserId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr>
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
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="btn"
                            onClick={() => setExpandedUserId(isExpanded ? null : p.id)}
                          >
                            {isExpanded ? "Skrýt" : "Zobrazit rezervace"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} style={{ background: "#f7f5ef" }}>
                            {userBookingsThisMonth.length === 0 ? (
                              <p style={{ fontSize: 13, color: "#55617a", margin: 0 }}>
                                Tenhle měsíc nemá žádnou rezervaci.
                              </p>
                            ) : (
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                                {userBookingsThisMonth.map((b) => (
                                  <li key={b.id}>
                                    <span className="mono">
                                      {new Date(b.starts_at).toLocaleString("cs-CZ")}–
                                      {new Date(b.ends_at).toLocaleTimeString("cs-CZ", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>{" "}
                                    · {roomName(b.room_id)}
                                    {b.purpose ? ` — ${b.purpose}` : ""}
                                    {!meetingRoomIds.has(b.room_id) && (
                                      <span style={{ color: "#55617a" }}> (nepočítá se do limitu)</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </section>

        <section className="admin-section">
          <h2 className="font-display">Poslední rezervace</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#55617a", marginRight: 8 }}>
              Kdo
            </label>
            <select
              value={bookingsFilterUserId}
              onChange={(e) => setBookingsFilterUserId(e.target.value)}
            >
              <option value="all">Všichni</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "#55617a", marginLeft: 8 }}>
              (posledních 100 rezervací celkem, ne jen u tohohle člověka)
            </span>
          </div>
          <div className="table-scroll">
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
              {bookings
                .filter((b) => bookingsFilterUserId === "all" || b.user_id === bookingsFilterUserId)
                .map((b) => (
                <tr key={b.id}>
                  <td>{rooms.find((r) => r.id === b.room_id)?.name ?? "—"}</td>
                  <td>
                    {b.profiles?.full_name || b.profiles?.email}
                    {b.recurrence_group_id && (
                      <span style={{ color: "#55617a", fontSize: 11 }}> · opakuje se</span>
                    )}
                  </td>
                  <td className="mono">
                    {new Date(b.starts_at).toLocaleString("cs-CZ")}
                  </td>
                  <td className="mono">
                    {new Date(b.ends_at).toLocaleString("cs-CZ")}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn danger" onClick={() => deleteBooking(b.id)}>
                      Smazat
                    </button>{" "}
                    {b.recurrence_group_id && (
                      <button
                        className="btn danger"
                        onClick={() => deleteBookingSeries(b.recurrence_group_id as string)}
                      >
                        Smazat sérii
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </div>
    </>
  );
}
