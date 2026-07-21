import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
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

  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: rooms } = await supabase.from("rooms").select("*").order("name");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("email");
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, profiles(email, full_name)")
    .order("starts_at", { ascending: false })
    .limit(100);

  return (
    <AdminClient
      profile={profile}
      initialRooms={rooms ?? []}
      initialProfiles={profiles ?? []}
      initialBookings={bookings ?? []}
    />
  );
}
