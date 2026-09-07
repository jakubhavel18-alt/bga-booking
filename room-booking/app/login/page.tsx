"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot";

const COPY: Record<Mode, { title: string; sub: string; submit: string }> = {
  login: {
    title: "Rezervace místností",
    sub: "Přihlaste se e-mailem a heslem.",
    submit: "Přihlásit se",
  },
  signup: {
    title: "Založit účet",
    sub: "Zadejte e-mail a zvolte si heslo. Účet vznikne rovnou, žádný e-mail nemusíte potvrzovat.",
    submit: "Založit účet",
  },
  forgot: {
    title: "Zapomenuté heslo",
    sub: "Zadejte e-mail, pošleme vám odkaz na nastavení nového hesla.",
    submit: "Poslat odkaz",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setStatus("idle");
    setErrorMsg(null);
    setPassword("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus("error");
        setErrorMsg("Špatný e-mail nebo heslo.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setStatus("error");
        setErrorMsg(
          error.message.toLowerCase().includes("password")
            ? "Heslo musí mít alespoň 6 znaků."
            : "Účet se nepodařilo založit. Zkuste to znovu."
        );
        return;
      }
      // Supabase vrací "úspěch" i pro už existující e-mail (kvůli bezpečnosti
      // neprozrazuje, jestli účet existuje) — pozná se podle prázdných identities.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setStatus("error");
        setErrorMsg("Tento e-mail už je zaregistrovaný — zkuste se rovnou přihlásit.");
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      // Kdyby bylo v Supabase přece jen zapnuté potvrzování e-mailem.
      setStatus("sent");
      return;
    }

    // mode === "forgot"
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    if (error) {
      setStatus("error");
      setErrorMsg("Nepodařilo se odeslat e-mail, zkuste to znovu.");
      return;
    }
    setStatus("sent");
  }

  const copy = COPY[mode];

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
        <h1 className="font-display">{copy.title}</h1>
        <p className="login-sub">{copy.sub}</p>

        {status === "sent" ? (
          <p className="login-sent">
            {mode === "forgot"
              ? "Odkaz na nastavení hesla je na cestě na "
              : "Potvrzovací odkaz je na cestě na "}
            <strong>{email}</strong>. Zkontrolujte schránku (i spam).
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
              autoComplete="email"
            />

            {mode !== "forgot" && (
              <>
                <label htmlFor="password">Heslo</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "alespoň 6 znaků" : "••••••••"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </>
            )}

            <button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Chvilku…" : copy.submit}
            </button>
            {status === "error" && errorMsg && <p className="login-error">{errorMsg}</p>}
          </form>
        )}

        <div className="auth-switch">
          {mode === "login" && (
            <>
              <button type="button" onClick={() => switchMode("forgot")}>
                Zapomenuté heslo?
              </button>
              <button type="button" onClick={() => switchMode("signup")}>
                Nemáte účet? Založit si ho
              </button>
            </>
          )}
          {mode === "signup" && (
            <button type="button" onClick={() => switchMode("login")}>
              Už máte účet? Přihlásit se
            </button>
          )}
          {mode === "forgot" && (
            <button type="button" onClick={() => switchMode("login")}>
              Zpět na přihlášení
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
