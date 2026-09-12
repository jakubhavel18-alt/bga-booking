"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import Header from "@/app/components/Header";
import { FLOORS } from "@/lib/floors";
import type {
  Profile,
  Room,
  Booking,
  UserRole,
  RoomType,
  RoomGroup,
  FloorplanLabel,
} from "@/lib/types";

// Načte obrázek (data URL) jako HTMLImageElement — potřeba, než ho jde
// vykreslit do canvasu (a odtud pak vložit do PDF).
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Zalomí text na max. 2 řádky tak, ať se vejde do dané šířky canvasu —
// dlouhé názvy místností ať nepřetékají přes okraj kartičky v PDF.
function wrapTwoLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 2) {
    const rest = lines.slice(1).join(" ");
    lines.length = 1;
    let truncated = rest;
    while (ctx.measureText(truncated + "…").width > maxWidth && truncated.length > 1) {
      truncated = truncated.slice(0, -1);
    }
    lines.push(truncated + "…");
  }
  return lines;
}

// Jedna kartička do PDF (název místnosti + QR kód) vykreslená do canvasu —
// text jde přes canvas, ne přes jsPDF vestavěné fonty, ať se v PDF správně
// zobrazí i česká diakritika (ř, š, ě, ů…), kterou standardní fonty PDF
// neumí.
async function buildQrCardCanvas(roomName: string, qrDataUrl: string): Promise<string> {
  const W = 640;
  const H = 760;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d7dce6";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  ctx.fillStyle = "#16233d";
  ctx.textAlign = "center";
  ctx.font = "700 42px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const lines = wrapTwoLines(ctx, roomName, W - 80);
  const lineHeight = 52;
  const nameBlockTop = lines.length === 1 ? 92 : 70;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, nameBlockTop + i * lineHeight));

  ctx.fillStyle = "#55617a";
  ctx.font = "400 22px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  ctx.fillText("Naskenujte pro rezervaci", W / 2, nameBlockTop + lines.length * lineHeight + 6);

  const qrImg = await loadImage(qrDataUrl);
  const qrSize = 480;
  const qrX = (W - qrSize) / 2;
  const qrY = nameBlockTop + lines.length * lineHeight + 40;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  return canvas.toDataURL("image/png");
}

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
  initialLabels,
}: {
  profile: Profile;
  initialRooms: Room[];
  initialProfiles: Profile[];
  initialBookings: Booking[];
  initialRoomGroups: RoomGroup[];
  initialRoomGroupRooms: { group_id: string; room_id: string }[];
  initialLabels: FloorplanLabel[];
}) {
  const [rooms, setRooms] = useState(initialRooms);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [bookings, setBookings] = useState(initialBookings);
  const [roomGroups, setRoomGroups] = useState(initialRoomGroups);
  const [roomGroupRooms, setRoomGroupRooms] = useState(initialRoomGroupRooms);
  const [labels, setLabels] = useState(initialLabels);
  const [newLabelText, setNewLabelText] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  // Adresa appky zjistíme až v prohlížeči (na serveru při vykreslení
  // stránky window neexistuje) — potřebujeme ji pro odkaz/QR kód místnosti.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // QR kódy pro jednotlivé místnosti — generují se rovnou v appce (dřív se
  // vytvářely přes externí api.qrserver.com, což posílalo adresu appky
  // ven a bylo to závislé na cizí službě). qrError je jen pro "co když se
  // to fakt nepovede vygenerovat" případ.
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [qrError, setQrError] = useState<string | null>(null);
  const [selectedQrRoomIds, setSelectedQrRoomIds] = useState<Set<string>>(
    () => new Set(initialRooms.map((r) => r.id))
  );
  const [qrPdfBusy, setQrPdfBusy] = useState(false);

  useEffect(() => {
    if (!origin || rooms.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        rooms.map(async (room) => {
          const roomUrl = `${origin}/dashboard?room=${room.id}`;
          try {
            const dataUrl = await QRCode.toDataURL(roomUrl, {
              width: 400,
              margin: 1,
              color: { dark: "#000000", light: "#ffffff" },
            });
            return [room.id, dataUrl] as const;
          } catch {
            return [room.id, ""] as const;
          }
        })
      );
      if (!cancelled) setQrDataUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, rooms]);

  function toggleQrRoom(roomId: string) {
    setSelectedQrRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  async function handleDownloadQrPdf() {
    const selected = rooms.filter((r) => selectedQrRoomIds.has(r.id) && qrDataUrls[r.id]);
    if (selected.length === 0) return;
    setQrPdfBusy(true);
    setQrError(null);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const cols = 2;
      const rowsPerPage = 3;
      const perPage = cols * rowsPerPage;
      const margin = 12;
      const pageW = 210;
      const pageH = 297;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2) / rowsPerPage;
      const cardSize = Math.min(cellW, cellH) - 6;

      for (let i = 0; i < selected.length; i++) {
        const room = selected[i];
        const posInPage = i % perPage;
        if (i > 0 && posInPage === 0) doc.addPage();
        const col = posInPage % cols;
        const row = Math.floor(posInPage / cols);
        const cardDataUrl = await buildQrCardCanvas(room.name, qrDataUrls[room.id]);
        const x = margin + col * cellW + (cellW - cardSize) / 2;
        const y = margin + row * cellH + (cellH - cardSize) / 2;
        // "MEDIUM" komprese je tu důležitá — bez ní jsPDF vloží obrázek
        // nekomprimovaně (desítky MB na pár místností místo pár set kB).
        doc.addImage(cardDataUrl, "PNG", x, y, cardSize, cardSize, undefined, "MEDIUM");
      }

      doc.save("qr-kody-mistnosti.pdf");
    } catch {
      setQrError("PDF se nepodařilo vygenerovat, zkuste to znovu.");
    } finally {
      setQrPdfBusy(false);
    }
  }
  const [newRoom, setNewRoom] = useState({
    name: "",
    type: "meeting_room" as RoomType,
    capacity: "",
    pos_x: "50",
    pos_y: "50",
    floor: "",
  });
  const [busy, setBusy] = useState(false);
  // Které patro se zrovna edituje v sekci "Půdorys — rozmístění".
  const [editorFloor, setEditorFloor] = useState<number>(FLOORS[1].value);
  const [newLabelFloor, setNewLabelFloor] = useState<string>(String(FLOORS[1].value));

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

  // ---------- Půdorys — přetažením myší/prstem ----------
  // Refy drží vždy nejaktuálnější rooms/labels, aby handler pointerup (ten
  // se zaregistruje jen jednou na pointerdown) neukládal do Supabase starou
  // pozici ze zastaralého closure, ale tu poslední z tažení.
  const floorplanEditorRef = useRef<HTMLDivElement>(null);
  const roomsRef = useRef(rooms);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);
  const draggingRef = useRef<{ kind: "room" | "label" | "resize"; id: string } | null>(null);

  function clampPct(v: number) {
    return Math.min(100, Math.max(0, v));
  }

  function posFromPointer(e: ReactPointerEvent) {
    const el = floorplanEditorRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: clampPct(((e.clientX - rect.left) / rect.width) * 100),
      y: clampPct(((e.clientY - rect.top) / rect.height) * 100),
    };
  }

  function handleDragStart(
    e: ReactPointerEvent<HTMLElement>,
    kind: "room" | "label",
    id: string
  ) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { kind, id };
  }

  // Úchyt v pravém dolním rohu kartičky místnosti — táhne se zvlášť od
  // přesunu (stopPropagation), aby se přesun a změna velikosti nebily.
  // Velikost je symetrická kolem středu (pos_x/pos_y), takže tažením rohu
  // o vzdálenost d od středu vznikne šířka/výška 2×d.
  function handleResizeStart(e: ReactPointerEvent<HTMLElement>, id: string) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { kind: "resize", id };
  }

  function handleDragMove(e: ReactPointerEvent<HTMLElement>) {
    const dragging = draggingRef.current;
    if (!dragging) return;
    const pos = posFromPointer(e);
    if (!pos) return;
    if (dragging.kind === "room") {
      setRooms((prev) =>
        prev.map((r) => (r.id === dragging.id ? { ...r, pos_x: pos.x, pos_y: pos.y } : r))
      );
    } else if (dragging.kind === "resize") {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== dragging.id) return r;
          const w = Math.min(95, Math.max(4, Math.abs(pos.x - r.pos_x) * 2));
          const h = Math.min(95, Math.max(4, Math.abs(pos.y - r.pos_y) * 2));
          return { ...r, pos_w: w, pos_h: h };
        })
      );
    } else {
      setLabels((prev) =>
        prev.map((l) => (l.id === dragging.id ? { ...l, pos_x: pos.x, pos_y: pos.y } : l))
      );
    }
  }

  async function handleDragEnd(e: ReactPointerEvent<HTMLElement>) {
    const dragging = draggingRef.current;
    if (!dragging) return;
    draggingRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const supabase = createClient();
    if (dragging.kind === "room") {
      const room = roomsRef.current.find((r) => r.id === dragging.id);
      if (room) {
        await supabase
          .from("rooms")
          .update({ pos_x: room.pos_x, pos_y: room.pos_y })
          .eq("id", room.id);
      }
    } else if (dragging.kind === "resize") {
      const room = roomsRef.current.find((r) => r.id === dragging.id);
      if (room) {
        await supabase
          .from("rooms")
          .update({ pos_w: room.pos_w, pos_h: room.pos_h })
          .eq("id", room.id);
      }
    } else {
      const label = labelsRef.current.find((l) => l.id === dragging.id);
      if (label) {
        await supabase
          .from("floorplan_labels")
          .update({ pos_x: label.pos_x, pos_y: label.pos_y })
          .eq("id", label.id);
      }
    }
  }

  function updateLabelText(id: string, text: string) {
    setLabels((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  }

  async function saveLabelText(label: FloorplanLabel) {
    const supabase = createClient();
    await supabase.from("floorplan_labels").update({ text: label.text }).eq("id", label.id);
  }

  async function addLabel() {
    if (!newLabelText.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("floorplan_labels").insert({
      text: newLabelText.trim(),
      pos_x: 50,
      pos_y: 50,
      floor: newLabelFloor === "" ? null : Number(newLabelFloor),
    });
    setNewLabelText("");
    setBusy(false);
    await refresh();
  }

  async function updateLabelFloor(label: FloorplanLabel, value: string) {
    const floor = value === "" ? null : Number(value);
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, floor } : l)));
    const supabase = createClient();
    await supabase.from("floorplan_labels").update({ floor }).eq("id", label.id);
  }

  async function deleteLabel(id: string) {
    const supabase = createClient();
    await supabase.from("floorplan_labels").delete().eq("id", id);
    await refresh();
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
    const [{ data: r }, { data: p }, { data: b }, { data: g }, { data: gr }, { data: l }] =
      await Promise.all([
        supabase.from("rooms").select("*").order("name"),
        supabase.from("profiles").select("*").order("email"),
        supabase
          .from("bookings")
          .select("*, profiles(email, full_name)")
          .order("starts_at", { ascending: false })
          .limit(100),
        supabase.from("room_groups").select("*").order("name"),
        supabase.from("room_group_rooms").select("group_id, room_id"),
        supabase.from("floorplan_labels").select("*").order("created_at"),
      ]);
    if (r) setRooms(r);
    if (p) setProfiles(p);
    if (b) setBookings(b as unknown as Booking[]);
    if (g) setRoomGroups(g);
    if (gr) setRoomGroupRooms(gr);
    if (l) setLabels(l);
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

  function roomUpdatePayload(room: Room) {
    return {
      name: room.name,
      type: room.type,
      description: room.description,
      capacity: room.capacity === null ? null : Number(room.capacity),
      pos_x: Number(room.pos_x),
      pos_y: Number(room.pos_y),
      pos_w: room.pos_w === null || String(room.pos_w) === "" ? null : Number(room.pos_w),
      pos_h: room.pos_h === null || String(room.pos_h) === "" ? null : Number(room.pos_h),
      floor: room.floor === null || String(room.floor) === "" ? null : Number(room.floor),
      permanent_occupant: room.permanent_occupant?.trim() ? room.permanent_occupant.trim() : null,
    };
  }

  async function saveRoom(room: Room) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("rooms").update(roomUpdatePayload(room)).eq("id", room.id);
    setBusy(false);
    await refresh();
  }

  // Uloží najednou všechny místnosti v tabulce, ne jen jednu po druhé —
  // pro případ, že admin přepíše víc řádků a chce to odeslat jedním klikem.
  async function saveAllRooms() {
    setBusy(true);
    const supabase = createClient();
    await Promise.all(
      rooms.map((room) =>
        supabase.from("rooms").update(roomUpdatePayload(room)).eq("id", room.id)
      )
    );
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
      floor: newRoom.floor === "" ? null : Number(newRoom.floor),
    });
    setNewRoom({ name: "", type: "meeting_room", capacity: "", pos_x: "50", pos_y: "50", floor: "" });
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <h2 className="font-display section-title" style={{ marginBottom: 0 }}>
              Místnosti a stoly
            </h2>
            <button className="btn primary" disabled={busy} onClick={saveAllRooms}>
              Uložit vše
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#55617a", margin: "6px 0 12px" }}>
            Klidně přepište víc řádků najednou a uložte je jedním klikem na
            „Uložit vše" — tlačítko „Uložit" u jednotlivého řádku pořád jde
            použít, když chcete odeslat jen tu jednu místnost.
          </p>
          <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Název</th>
                <th>Typ</th>
                <th>Patro</th>
                <th>Kapacita</th>
                <th>Poloha X %</th>
                <th>Poloha Y %</th>
                <th>Šířka %</th>
                <th>Výška %</th>
                <th>Trvale obsazeno (kým)</th>
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
                      <option value="space">Stůl</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={room.floor === null ? "" : String(room.floor)}
                      onChange={(e) => updateRoomField(room.id, "floor", e.target.value)}
                    >
                      <option value="">Bez patra</option>
                      {FLOORS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
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
                  <td>
                    <input
                      type="number"
                      style={{ width: 64 }}
                      placeholder="—"
                      value={room.pos_w ?? ""}
                      onChange={(e) => updateRoomField(room.id, "pos_w", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 64 }}
                      placeholder="—"
                      value={room.pos_h ?? ""}
                      onChange={(e) => updateRoomField(room.id, "pos_h", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      style={{ width: 140 }}
                      placeholder="— volné —"
                      value={room.permanent_occupant ?? ""}
                      onChange={(e) => updateRoomField(room.id, "permanent_occupant", e.target.value)}
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
                <option value="space">Stůl</option>
              </select>
            </div>
            <div className="field">
              <label>Patro</label>
              <select
                value={newRoom.floor}
                onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
              >
                <option value="">Bez patra</option>
                {FLOORS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
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
            doladíte. Sloupec „Trvale obsazeno (kým)" slouží pro fixní místo
            přiřazené konkrétnímu člověku/firmě natrvalo, mimo běžný
            kalendář — stačí vyplnit jméno/firmu a appka přes tuhle místnost
            už nedovolí založit novou rezervaci; smazáním textu je místnost
            zase normálně volná.
          </p>
        </section>

        <section className="admin-section">
          <h2 className="font-display section-title">Půdorys — rozmístění</h2>
          <p style={{ fontSize: 13, color: "#55617a", marginBottom: 16 }}>
            Přetáhněte místnost nebo popisek myší (na telefonu prstem) přímo
            na místo v reálném půdorysu daného patra — pozice se uloží hned
            po puštění. U místnosti jde navíc chytit malý čtvereček v pravém
            dolním rohu kartičky a roztáhnout ji do skutečné velikosti dané
            zasedačky/stolu na plánku (jde nastavit i přesně čísly ve sloupcích
            „Šířka %" / „Výška %" v tabulce místností výše). Popisky slouží jen
            jako volný text bez rezervace (např. „Recepce", „Kuchyňka", „WC").
            Místnost nebo popisek se tu zobrazí, jen když má přiřazené tohle
            patro (viz sloupec „Patro" v tabulce místností výše / u popisků
            níže).
          </p>

          <div className="floor-tabs">
            {FLOORS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`btn floor-tab ${editorFloor === f.value ? "active" : ""}`}
                onClick={() => setEditorFloor(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div
            ref={floorplanEditorRef}
            className="floorplan admin-floorplan-editor has-bg"
            style={{ aspectRatio: FLOORS.find((f) => f.value === editorFloor)?.aspect }}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={editorFloor}
              src={FLOORS.find((f) => f.value === editorFloor)?.svg}
              alt=""
              className="floorplan-bg"
              draggable={false}
            />
            {rooms
              .filter((room) => room.floor === editorFloor)
              .map((room) => (
                <div
                  key={room.id}
                  className={`room-box admin-drag${room.type === "space" ? " space" : ""}${
                    room.pos_w && room.pos_h ? " sized" : ""
                  }`}
                  style={{
                    left: `${room.pos_x}%`,
                    top: `${room.pos_y}%`,
                    width: room.pos_w ? `${room.pos_w}%` : undefined,
                    height: room.pos_h ? `${room.pos_h}%` : undefined,
                  }}
                  onPointerDown={(e) => handleDragStart(e, "room", room.id)}
                >
                  <span className="name">{room.name}</span>
                  <span
                    className="room-resize-handle"
                    onPointerDown={(e) => handleResizeStart(e, room.id)}
                    title="Přetažením nastavíte velikost místnosti na plánku"
                  />
                </div>
              ))}
            {labels
              .filter((label) => label.floor === editorFloor)
              .map((label) => (
                <div
                  key={label.id}
                  className="floorplan-label admin-drag-label"
                  style={{ left: `${label.pos_x}%`, top: `${label.pos_y}%` }}
                  onPointerDown={(e) => handleDragStart(e, "label", label.id)}
                >
                  {label.text || "(bez textu)"}
                </div>
              ))}
          </div>
          {rooms.some((r) => r.floor === null) && (
            <p style={{ fontSize: 12, color: "#55617a", marginTop: 8 }}>
              {rooms.filter((r) => r.floor === null).length} místností nemá
              přiřazené patro, takže se tu zatím neukazují — nastavte jim ho v
              tabulce místností výše.
            </p>
          )}

          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Text popisku</th>
                  <th>Patro</th>
                  <th>Poloha X %</th>
                  <th>Poloha Y %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label) => (
                  <tr key={label.id}>
                    <td>
                      <input
                        value={label.text}
                        onChange={(e) => updateLabelText(label.id, e.target.value)}
                        onBlur={() => saveLabelText(label)}
                      />
                    </td>
                    <td>
                      <select
                        value={label.floor === null ? "" : String(label.floor)}
                        onChange={(e) => updateLabelFloor(label, e.target.value)}
                      >
                        <option value="">Bez patra</option>
                        {FLOORS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono">{Math.round(label.pos_x)}</td>
                    <td className="mono">{Math.round(label.pos_y)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn danger" onClick={() => deleteLabel(label.id)}>
                        Smazat
                      </button>
                    </td>
                  </tr>
                ))}
                {labels.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: "#55617a" }}>
                      Zatím žádný popisek.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="new-room-form" style={{ marginTop: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Nový popisek</label>
              <input
                value={newLabelText}
                onChange={(e) => setNewLabelText(e.target.value)}
                placeholder="např. Recepce"
              />
            </div>
            <div className="field">
              <label>Patro</label>
              <select value={newLabelFloor} onChange={(e) => setNewLabelFloor(e.target.value)}>
                <option value="">Bez patra</option>
                {FLOORS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn primary" disabled={busy} onClick={addLabel}>
              Přidat popisek
            </button>
          </div>
        </section>

        <section className="admin-section">
          <h2 className="font-display section-title">QR kódy pro rezervaci od dveří</h2>
          <p style={{ fontSize: 13, color: "#55617a", marginBottom: 16 }}>
            Vytiskněte a nalepte u konkrétní místnosti. Naskenování otevře
            appku rovnou na rezervaci téhle místnosti a předvyplní čas „teď" —
            pro last-minute rezervaci z telefonu tak stačí pár klepnutí.
            Zaškrtněte, které místnosti chcete, a stáhněte je jako jedno PDF
            připravené k tisku (dvě QR kartičky na řádek, 6 na stránku).
          </p>

          {rooms.length > 0 && (
            <div className="qr-controls">
              <button
                type="button"
                className="btn"
                onClick={() => setSelectedQrRoomIds(new Set(rooms.map((r) => r.id)))}
              >
                Vybrat vše
              </button>
              <button type="button" className="btn" onClick={() => setSelectedQrRoomIds(new Set())}>
                Zrušit výběr
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={qrPdfBusy || selectedQrRoomIds.size === 0}
                onClick={handleDownloadQrPdf}
              >
                {qrPdfBusy ? "Připravuji PDF…" : `Stáhnout PDF (${selectedQrRoomIds.size})`}
              </button>
            </div>
          )}
          {qrError && <p className="form-error">{qrError}</p>}

          <div className="qr-grid">
            {rooms.map((room) => {
              const qrSrc = qrDataUrls[room.id] || "";
              const checked = selectedQrRoomIds.has(room.id);
              return (
                <div className={`qr-card ${checked ? "qr-card-selected" : ""}`} key={room.id}>
                  <label className="qr-card-checkbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleQrRoom(room.id)}
                    />
                    Vybrat pro PDF
                  </label>
                  <div className="qr-card-name">{room.name}</div>
                  {qrSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrSrc} alt={`QR kód – ${room.name}`} width={160} height={160} />
                  ) : (
                    <div style={{ width: 160, height: 160 }} />
                  )}
                  {qrSrc && (
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
          <h2 className="font-display section-title">Lidé a práva</h2>
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
          <h2 className="font-display section-title">Skupiny místností</h2>
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
                          ({room.type === "meeting_room" ? "zasedačka" : "stůl"})
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
          <h2 className="font-display section-title">Čerpání hodin</h2>
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
          <h2 className="font-display section-title">Poslední rezervace</h2>
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
