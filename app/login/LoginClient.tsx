"use client";

import Link from "next/link";
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

    window.location.replace(next);
  };

  return (
    <main className="wrap">
      <div className="brand">
        <Link href="/" className="brandLink" aria-label="Authored home">
          <img src="/assets/logo-authored.png" alt="Authored" className="brandLogo" />
        </Link>
      </div>

      <h1>Log in</h1>
      <p className="sub">Welcome back. Pick up right where you left off.</p>

      <div className="card">
        <form onSubmit={onLogin}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <button disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>

          {msg && <div className="msg">{msg}</div>}

          <div className="row">
            <Link href={`/reset?email=${encodeURIComponent(email.trim())}`}>
              Forgot password?
            </Link>

            <Link
              href={`/signup?next=${encodeURIComponent(next)}${
                email ? `&email=${encodeURIComponent(email)}` : ""
              }`}
            >
              Create an account
            </Link>
          </div>
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

        .brand {
          display: flex;
          justify-content: center;
          margin: 0 0 18px;
        }

        .brandLink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 16px 22px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(10, 12, 18, 0.55);
          backdrop-filter: blur(14px);
          box-shadow: 0 16px 50px rgba(0, 0, 0, 0.28);
        }

        .brandLogo {
          display: block;
          height: 54px;
          width: auto;
        }

        h1 {
          font-size: 40px;
          margin: 0 0 10px;
          font-weight: 900;
          letter-spacing: -0.03em;
          text-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
        }

        .sub {
          color: rgba(255, 255, 255, 0.82);
          margin: 0 0 22px;
          line-height: 1.5;
          text-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
          font-size: 14px;
        }

        .card {
          border-radius: 22px;
          padding: 22px;
          background: rgba(15, 18, 24, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          text-align: left;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.32);
        }

        label {
          display: block;
          font-size: 13px;
          margin: 12px 0 6px;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 700;
        }

        input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          margin-bottom: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: white;
          box-sizing: border-box;
        }

        input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.32);
          background: rgba(255, 255, 255, 0.08);
        }

        button {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-weight: 900;
          font-size: 15px;
          background: white;
          color: black;
          border: none;
          cursor: pointer;
          margin-top: 4px;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .msg {
          margin-top: 10px;
          color: #ffb4b4;
          min-height: 18px;
          line-height: 1.45;
          font-size: 13px;
        }

        .row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          flex-wrap: wrap;
        }

        .row a {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.24);
          padding-bottom: 2px;
          font-size: 13px;
        }

        .row a:hover {
          border-bottom-color: rgba(255, 255, 255, 0.5);
        }

        @media (max-width: 640px) {
          .wrap {
            margin: 26px 16px;
            padding: 0;
          }

          .brand {
            margin-bottom: 16px;
          }

          .brandLink {
            width: auto;
            max-width: 100%;
            padding: 14px 18px;
            border-radius: 22px;
          }

          .brandLogo {
            height: 44px;
            max-width: 100%;
          }

          h1 {
            font-size: 32px;
          }

          .card {
            padding: 18px;
            border-radius: 20px;
          }

          .row {
            justify-content: space-between;
          }
        }
      `}</style>
    </main>
  );
}