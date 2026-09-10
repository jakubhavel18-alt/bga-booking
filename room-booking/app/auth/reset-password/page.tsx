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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/business-gate-logo.png" alt="" />
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
