import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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

  return (
    <DashboardClient
      profile={profile}
      initialRooms={rooms ?? []}
      initialBookings={bookings ?? []}
    />
  );
}
