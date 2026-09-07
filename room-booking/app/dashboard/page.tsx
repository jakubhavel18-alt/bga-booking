import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const supabase = await createClient();
  const { room: roomParam } = await searchParams;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Náhled appky funguje i bez přihlášení — profile zůstane null a appka
  // rovnou přejde do režimu "jen se dívám" (bez rezervování).
  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select("*")
    .order("name");

  // Rezervace od včerejška dál stačí (minulé si appka po straně odfiltruje)
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, profiles(email, full_name)")
    .gte("ends_at", since)
    .order("starts_at");

  // QR kód u dveří vede na /dashboard?room=<id> — panel dané místnosti se
  // otevře už v serverem vykresleném HTML, ať appka na telefonu po
  // naskenování nejdřív neblikne celým půdorysem a pak neskočí do panelu,
  // ale rovnou naběhne na jednu obrazovku s rezervací.
  const initialSelectedRoomId =
    roomParam && (rooms ?? []).some((r) => r.id === roomParam) ? roomParam : null;

  return (
    <DashboardClient
      profile={profile}
      initialRooms={rooms ?? []}
      initialBookings={bookings ?? []}
      initialSelectedRoomId={initialSelectedRoomId}
    />
  );
}
