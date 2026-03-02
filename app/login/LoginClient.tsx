"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => {
    const n = sp.get("next") || "/start";
    return n.startsWith("/") ? n : "/start";
  }, [sp]);

  const [email, setEmail] = useState(sp.get("email") || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }

    const user = data?.user || data?.session?.user;

    if (!user?.email_confirmed_at) {
      router.replace(
        `/verify?next=${encodeURIComponent(next)}&email=${encodeURIComponent(
          email.trim()
        )}`
      );
      return;
    }

    // 🔥 IMPORTANT: Full reload so guard sees session
    window.location.replace(next);
  };

  return (
    <main className="wrap">
      <h1>Log in</h1>
      <p className="sub">Welcome back. Pick up right where you left off.</p>

      <div className="card">
        <form onSubmit={onLogin}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>

          {msg && <div className="msg">{msg}</div>}
        </form>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 520px;
          margin: 80px auto;
          padding: 0 20px;
          text-align: center;
          position: relative;
          z-index: 5;
        }

        .card {
          border-radius: 18px;
          padding: 22px;
          background: rgba(15, 18, 24, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          text-align: left;
        }

        input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          margin-bottom: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: white;
        }

        button {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-weight: 900;
          background: white;
          color: black;
          border: none;
        }

        .msg {
          margin-top: 10px;
          color: #ffb4b4;
        }
      `}</style>
    </main>
  );
}