export type UserRole = "viewer" | "booker" | "admin";
export type RoomType = "meeting_room" | "space";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  monthly_hours_limit: number | null;
  // NULL = vidí všechny místnosti/prostory (výchozí). Nastavená skupina =
  // appka mu ukáže jen místnosti přiřazené do téhle skupiny (např. "Fixní
  // místo" = jen zasedačky + Velký sál, bez ostatního coworku).
  room_group_id: string | null;
  created_at: string;
}

export interface RoomGroup {
  id: string;
  name: string;
  created_at: string;
}

export interface FloorplanLabel {
  id: string;
  text: string;
  pos_x: number;
  pos_y: number;
  // Které patro (viz lib/floors.ts) — NULL = nezařazeno, na žádném
  // konkrétním půdorysu se nezobrazí.
  floor: number | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  description: string | null;
  capacity: number | null;
  pos_x: number;
  pos_y: number;
  // Které patro (viz lib/floors.ts) — NULL = nezařazeno (appka místnost
  // ukáže v seznamech, ale na žádném půdorysu, dokud admin patro nenastaví).
  floor: number | null;
  created_at: string;
}

export interface Booking {
  id: string;
  room_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  purpose: string | null;
  // Sdílené appkou vygenerované UUID pro všechny termíny jedné opakované
  // rezervace (týdně/měsíčně) — NULL u jednorázové rezervace.
  recurrence_group_id: string | null;
  created_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}
