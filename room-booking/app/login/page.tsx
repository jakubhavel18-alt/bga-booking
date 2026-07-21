"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="36" height="36">
            <rect
              x="4"
              y="10"
              width="40"
              height="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <line
              x1="4"
              y1="20"
              x2="44"
              y2="20"
              stroke="currentColor"
              strokeWidth="1"
            />
            <line
              x1="20"
              y1="20"
              x2="20"
              y2="40"
              stroke="currentColor"
              strokeWidth="1"
            />
            <line
              x1="32"
              y1="10"
              x2="32"
              y2="20"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </div>
        <h1 className="font-display">Rezervace místností</h1>
        <p className="login-sub">
          Zadejte e-mail a pošleme vám přihlašovací odkaz. Účet vznikne
          automaticky napoprvé, žádné heslo není potřeba.
        </p>

        {status === "sent" ? (
          <p className="login-sent">
            Odkaz je na cestě na <strong>{email}</strong>. Zkontrolujte
            schránku (i spam) a klikněte na něj.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jméno@firma.cz"
            />
            <button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Odesílám…" : "Poslat přihlašovací odkaz"}
            </button>
            {status === "error" && (
              <p className="login-error">
                Něco se nepovedlo, zkuste to prosím znovu.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
