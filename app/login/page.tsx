"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

function setCookie(name: string, value: string, maxAgeSeconds?: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const maxAge = typeof maxAgeSeconds === "number" ? `; Max-Age=${maxAgeSeconds}` : "";
  document.cookie = `${name}=${encodeURIComponent(value || "")}; Path=/; SameSite=Lax${maxAge}${secure}`;
}

function writeAuthCookies(session: any) {
  if (!session?.access_token) {
    setCookie("sb-access-token", "", 0);
    setCookie("sb-refresh-token", "", 0);
    return;
  }
  const oneWeek = 60 * 60 * 24 * 7;
  setCookie("sb-access-token", session.access_token, oneWeek);
  setCookie("sb-refresh-token", session.refresh_token || "", oneWeek);
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase public env vars");
  return createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = sp.get("next") || "/start";
  const initialEmail = sp.get("email") || "";

  const supabase = useMemo(() => getSupabase(), []);

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"" | "ok" | "err">("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;

      if (user?.email_confirmed_at) {
        router.replace(next);
      }
    })();
  }, [next, router, supabase]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setMsgKind("");
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      writeAuthCookies(data?.session);

      if (!data?.user?.email_confirmed_at) {
        setMsg("Please verify your email first.");
        setMsgKind("err");
        return;
      }

      router.replace(next);
    } catch (err: any) {
      setMsg(err?.message || "Login failed.");
      setMsgKind("err");
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email.trim()) {
      setMsg("Enter your email above first.");
      setMsgKind("err");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/verify`,
      });

      if (error) throw error;

      setMsg("Reset link sent. Check your email.");
      setMsgKind("ok");
    } catch (err: any) {
      setMsg(err?.message || "Could not send reset link.");
      setMsgKind("err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* GLOBAL BACKGROUND */}
      <style jsx global>{`
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #0b0d12;
          color: white;
          overflow-x: hidden;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -2;
          background: url("/assets/signup-hero.webp") center/cover no-repeat;
          transform: scale(1.03);
          filter: saturate(1.05) contrast(1.05);
        }

        body::after {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(900px 600px at 20% 20%, rgba(0,0,0,.35), rgba(0,0,0,.72) 70%),
            linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.68));
        }
      `}</style>

      <main className="wrap">
        <h1>Log in</h1>
        <p className="sub">Welcome back. Pick up right where you left off.</p>

        <div className="card">
          <form onSubmit={onLogin}>
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button type="submit" disabled={busy}>
              {busy ? "Logging in..." : "Log in"}
            </button>

            <div className={`msg ${msgKind}`}>{msg}</div>

            <div className="row">
              <Link href={`/signup?next=${encodeURIComponent(next)}`}>
                Create an account
              </Link>
              <button type="button" className="smallBtn" onClick={onReset}>
                Send reset link
              </button>
            </div>
          </form>
        </div>
      </main>

      <style jsx>{`
        .wrap {
          max-width: 520px;
          margin: 80px auto;
          padding: 0 20px;
          text-align: center;
        }

        h1 {
          font-size: 40px;
          margin-bottom: 10px;
          font-weight: 900;
        }

        .sub {
          color: rgba(255,255,255,.78);
          margin-bottom: 22px;
          font-size: 14px;
        }

        .card {
          border-radius: 18px;
          padding: 22px;
          background: rgba(15,18,24,.55);
          border: 1px solid rgba(255,255,255,.14);
          backdrop-filter: blur(14px);
        }

        label {
          display: block;
          font-size: 13px;
          margin: 12px 0 6px;
          font-weight: 700;
        }

        input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06);
          color: white;
        }

        button {
          width: 100%;
          margin-top: 16px;
          padding: 12px;
          border-radius: 12px;
          font-weight: 900;
          background: white;
          color: black;
          cursor: pointer;
        }

        .msg {
          margin-top: 12px;
          font-size: 13px;
        }

        .msg.err { color: #ffb4b4; }
        .msg.ok { color: #bff0bf; }

        .row {
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .smallBtn {
          background: rgba(255,255,255,.06);
          color: white;
          border: 1px solid rgba(255,255,255,.18);
          padding: 8px 12px;
          border-radius: 12px;
        }
      `}</style>
    </>
  );
}