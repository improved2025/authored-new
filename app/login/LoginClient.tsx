"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

function qsNext(sp: ReturnType<typeof useSearchParams>) {
  const n = sp.get("next") || "/start";
  return n.startsWith("/") ? n : "/start";
}

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => qsNext(sp), [sp]);
  const initialEmail = useMemo(() => sp.get("email") || "", [sp]);

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"" | "ok" | "err">("");

  const waitForAccount = async (timeoutMs = 4000) => {
    const start = Date.now();
    while (!(window as any).AuthoredAccount?.client?.auth?.getSession) {
      if (Date.now() - start > timeoutMs) return null;
      await new Promise((r) => setTimeout(r, 50));
    }
    return (window as any).AuthoredAccount;
  };

  useEffect(() => {
    // If already logged in and verified, go straight to next.
    (async () => {
      const account = await waitForAccount();
      const client = account?.client;
      if (!client?.auth?.getSession) return;

      const { data } = await client.auth.getSession();
      const user = data?.session?.user;

      if (user?.email_confirmed_at) {
        window.location.replace(next);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setMsgKind("");
    setBusy(true);

    try {
      const account = await waitForAccount();
      const client = account?.client;
      if (!client?.auth?.signInWithPassword) throw new Error("Auth not ready. Refresh and try again.");

      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // keep legacy cookies for your API routes
      writeAuthCookies(data?.session);

      const user = data?.user || data?.session?.user;
      if (!user?.email_confirmed_at) {
        setMsg("Please verify your email first.");
        setMsgKind("err");
        router.replace(`/verify?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email.trim())}`);
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
    const em = email.trim();
    if (!em) {
      setMsg("Enter your email above first.");
      setMsgKind("err");
      return;
    }

    setBusy(true);
    setMsg("");
    setMsgKind("");

    try {
      const account = await waitForAccount();
      const client = account?.client;
      if (!client?.auth?.resetPasswordForEmail) throw new Error("Auth not ready. Refresh and try again.");

      const redirectTo = `${window.location.origin}/verify?next=${encodeURIComponent(next)}`;
      const { error } = await client.auth.resetPasswordForEmail(em, { redirectTo });
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
            autoComplete="email"
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button type="submit" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>

          <div className={`msg ${msgKind}`}>{msg}</div>

          <div className="row">
            <Link href={`/signup?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>
              Create an account
            </Link>

            <button type="button" className="smallBtn" onClick={onReset} disabled={busy}>
              Send reset link
            </button>
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

        h1 {
          font-size: 40px;
          margin-bottom: 10px;
          font-weight: 900;
        }

        .sub {
          color: rgba(255, 255, 255, 0.78);
          margin-bottom: 22px;
          font-size: 14px;
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
          font-weight: 700;
        }

        input {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: white;
          box-sizing: border-box;
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
          border: none;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .msg {
          margin-top: 12px;
          font-size: 13px;
          min-height: 18px;
        }

        .msg.err {
          color: #ffb4b4;
        }
        .msg.ok {
          color: #bff0bf;
        }

        .row {
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .smallBtn {
          width: auto;
          background: rgba(255, 255, 255, 0.06);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 8px 12px;
          border-radius: 12px;
        }

        a {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.28);
          padding-bottom: 2px;
        }
      `}</style>
    </main>
  );
}