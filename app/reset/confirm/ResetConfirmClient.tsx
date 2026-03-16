"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Status = "loading" | "ready" | "invalid" | "error";

function readHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash || "";
  return new URLSearchParams(hash);
}

function cleanPath(next: string) {
  const n = (next || "").trim();
  if (!n) return "/start";
  return n.startsWith("/") ? n : "/start";
}

function buildCleanResetUrl(next: string) {
  return `/reset/confirm?next=${encodeURIComponent(next)}`;
}

export default function ResetConfirmClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => {
    return cleanPath(sp.get("next") || "/start");
  }, [sp]);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState("");

  async function establishRecoverySessionFromUrl() {
    const code = sp.get("code") || "";
    const token_hash = sp.get("token_hash") || "";
    const type = (sp.get("type") || "").trim();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanResetUrl(next));
      return true;
    }

    if (token_hash && type === "recovery") {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: "recovery",
      });
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanResetUrl(next));
      return true;
    }

    const hash = readHashParams();
    const access_token = hash.get("access_token") || "";
    const refresh_token = hash.get("refresh_token") || "";
    const hashType = (hash.get("type") || "").trim();

    if (access_token && refresh_token && (!hashType || hashType === "recovery")) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanResetUrl(next));
      return true;
    }

    return false;
  }

  async function bootstrap() {
    setStatus("loading");
    setMsg("");

    try {
      const hasAuthParams =
        Boolean(sp.get("code")) ||
        Boolean(sp.get("token_hash")) ||
        Boolean(readHashParams().get("access_token"));

      if (hasAuthParams) {
        await establishRecoverySessionFromUrl();
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!data?.session) {
        setStatus(hasAuthParams ? "invalid" : "error");
        setMsg(
          hasAuthParams
            ? "This reset link is invalid, expired, already used, or was opened in a different browser or device."
            : "No recovery session found. Please use the link from your reset email."
        );
        return;
      }

      setStatus("ready");
      setMsg("Enter your new password.");
    } catch (err: any) {
      setStatus("invalid");
      setMsg(
        err?.message ||
          "This reset link is invalid, expired, already used, or was opened in a different browser or device."
      );
    }
  }

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (status !== "ready") return;

    setMsg("");

    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Password updated. Redirecting to login...");

      await supabase.auth.signOut();

      window.setTimeout(() => {
        router.replace("/login?reset=success");
      }, 800);
    } catch (err: any) {
      setMsg(err?.message || "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>Set new password</h1>
      <p className="sub">Choose a strong password you’ll remember.</p>

      <div className="card">
        {status === "loading" ? (
          <div className="msg">Preparing secure reset...</div>
        ) : (
          <form onSubmit={onSetPassword}>
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={status !== "ready" || busy}
            />

            <button disabled={status !== "ready" || busy}>
              {busy ? "Saving..." : "Update password"}
            </button>

            {!!msg && (
              <div className={`msg ${status === "ready" ? "" : "err"}`}>{msg}</div>
            )}

            <button
              type="button"
              className="ghost"
              onClick={() => router.replace(`/reset?next=${encodeURIComponent(next)}`)}
            >
              Request a new reset link
            </button>
          </form>
        )}
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
          color: rgba(255, 255, 255, 0.9);
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