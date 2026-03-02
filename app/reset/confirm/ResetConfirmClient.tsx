"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
}

export default function ResetConfirmClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => getSupabase(), []);

  const next = useMemo(() => {
    const n = sp.get("next") || "/start";
    return n.startsWith("/") ? n : "/start";
  }, [sp]);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"" | "ok" | "err">("");

  useEffect(() => {
    // Supabase email link should establish a recovery session automatically.
    // If it doesn't, we show a clean error instead of guessing.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setMsg("This reset link is invalid or expired. Request a new one.");
        setKind("err");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setKind("");

    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      setKind("err");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Password updated. Redirecting...");
      setKind("ok");

      setTimeout(() => {
        window.location.replace(next);
      }, 600);
    } catch (err: any) {
      setMsg(err?.message || "Could not update password.");
      setKind("err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap">
      <h1>Set new password</h1>
      <p className="sub">Choose a strong password you’ll remember.</p>

      <div className="card">
        <form onSubmit={onSetPassword}>
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />

          <button disabled={busy}>{busy ? "Saving..." : "Update password"}</button>

          {!!msg && <div className={`msg ${kind}`}>{msg}</div>}

          <button
            type="button"
            className="ghost"
            onClick={() => router.replace(`/reset?next=${encodeURIComponent(next)}`)}
          >
            Request a new reset link
          </button>
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
        .sub {
          color: rgba(255, 255, 255, 0.78);
          margin: 0 0 16px;
        }
        .card {
          border-radius: 18px;
          padding: 22px;
          background: rgba(15, 18, 24, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          text-align: left;
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
        button {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-weight: 900;
          background: white;
          color: black;
          border: none;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .msg {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.4;
          min-height: 18px;
        }
        .msg.ok {
          color: #bff0bf;
        }
        .msg.err {
          color: #ffb4b4;
        }
        .ghost {
          margin-top: 10px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
      `}</style>
    </main>
  );
}