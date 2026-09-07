"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle"
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      return;
    }
    setStatus("done");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
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
            <line x1="4" y1="20" x2="44" y2="20" stroke="currentColor" strokeWidth="1" />
            <line x1="20" y1="20" x2="20" y2="40" stroke="currentColor" strokeWidth="1" />
            <line x1="32" y1="10" x2="32" y2="20" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>
        <h1 className="font-display">Nastavit heslo</h1>
        <p className="login-sub">
          {status === "done"
            ? "Heslo je nastavené, přesměrovávám vás…"
            : "Zadejte nové heslo ke svému účtu."}
        </p>

        {status !== "done" && (
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="password">Nové heslo</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="alespoň 6 znaků"
              autoComplete="new-password"
            />
            <button type="submit" disabled={status === "saving"}>
              {status === "saving" ? "Ukládám…" : "Uložit heslo"}
            </button>
            {status === "error" && (
              <p className="login-error">
                Odkaz už asi vypršel — vraťte se na přihlášení a vyžádejte si
                nový přes „Zapomenuté heslo?".
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
