"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const roleLabels: Record<Profile["role"], string> = {
  admin: "Admin",
  booker: "Rezervující",
  viewer: "Jen náhled",
};

export default function Header({ profile }: { profile: Profile | null }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="brand">
        <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
          <rect
            x="4"
            y="10"
            width="40"
            height="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <line x1="4" y1="20" x2="44" y2="20" stroke="currentColor" strokeWidth="1" />
          <line x1="20" y1="20" x2="20" y2="40" stroke="currentColor" strokeWidth="1" />
        </svg>
        <h1 className="font-display">Rezervace místností</h1>
      </div>
      <nav>
        {profile && (
          <>
            <span className={`role-badge ${profile.role}`}>
              {roleLabels[profile.role]}
            </span>
            <span>{profile.email}</span>
            {profile.role === "admin" && <Link href="/admin">Správa</Link>}
            <Link href="/dashboard">Půdorys</Link>
            <button className="logout" onClick={handleLogout}>
              Odhlásit
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
