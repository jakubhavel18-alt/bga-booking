"use client";

import { useState } from "react";
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
  // Na telefonu je nabídka schovaná pod tímhle přepínačem (hamburger) — ať
  // hlavička zůstane na jeden řádek a nezabírá zbytečně místo.
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <div className="app-header-bar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/business-gate-logo.png" alt="Business Gate" className="brand-logo" />
          <h1 className="font-display">Rezervace místností</h1>
        </div>

        {profile ? (
          <button
            type="button"
            className="menu-toggle menu-toggle-hamburger"
            aria-label={menuOpen ? "Zavřít nabídku" : "Otevřít nabídku"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        ) : (
          <Link href="/login" className="menu-toggle menu-toggle-login">
            Přihlásit se
          </Link>
        )}
      </div>

      {profile && (
        <nav className={menuOpen ? "open" : ""}>
          <span className={`role-badge ${profile.role}`}>
            {roleLabels[profile.role]}
          </span>
          <span className="nav-email">{profile.email}</span>
          {profile.role === "admin" && (
            <Link href="/admin" onClick={() => setMenuOpen(false)}>
              Správa
            </Link>
          )}
          <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
            Půdorys
          </Link>
          <button className="logout" onClick={handleLogout}>
            Odhlásit
          </button>
        </nav>
      )}
    </header>
  );
}
