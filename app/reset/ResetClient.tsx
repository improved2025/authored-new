"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function cleanPath(next: string) {
  const n = (next || "").trim();
  if (!n) return "/start";
  return n.startsWith("/") ? n : "/start";
}

function buildResetRedirect(next: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://myauthored.com";
  return `${origin}/reset/confirm?next=${encodeURIComponent(next)}`;
}

export default function ResetClient() {
  const sp = useSearchParams();

  const next = useMemo(() => {
    return cleanPath(sp.get("next") || "/start");
  }, [sp]);

  const [email, setEmail] = useState(sp.get("email") || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"" | "ok" | "err">("");

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setKind("");

    const em = email.trim();
    if (!em) {
      setMsg("Enter your email.");
      setKind("err");
      return;
    }

    setBusy(true);

    try {
      console.log("RESET_REDIRECT_TO", buildResetRedirect(next));
      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: buildResetRedirect(next),
      });

      if (error) throw error;

      setMsg("Password reset email sent. Check your inbox and spam/junk folder.");
      setKind("ok");
    } catch (err: any) {
      setMsg(err?.message || "Could not send reset email.");
      setKind("err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap">
      <h1>Reset password</h1>
      <p className="sub">We’ll email you a link to set a new password.</p>

      <div className="card">
        <form onSubmit={onSend}>
          <label>Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />

          <button disabled={busy}>
            {busy ? "Sending..." : "Send reset link"}
          </button>

          {!!msg && <div className={`msg ${kind}`}>{msg}</div>}

          <div className="links">
            <Link
              className="link"
              href={`/login?next=${encodeURIComponent(next)}${
                email ? `&email=${encodeURIComponent(email.trim())}` : ""
              }`}
            >
              Back to login
            </Link>

            <Link
              className="link strong"
              href={`/signup?next=${encodeURIComponent(next)}${
                email ? `&email=${encodeURIComponent(email.trim())}` : ""
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
        .links {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          font-size: 13px;
          flex-wrap: wrap;
        }
        .link {
          color: rgba(255, 255, 255, 0.84);
          text-decoration: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.25);
          padding-bottom: 2px;
        }
        .link:hover {
          color: rgba(255, 255, 255, 0.95);
          border-bottom-color: rgba(255, 255, 255, 0.5);
        }
        .strong {
          font-weight: 800;
        }
      `}</style>
    </main>
  );
}