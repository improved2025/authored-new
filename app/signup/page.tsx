// app/signup/page.tsx
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
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
}

function isRealUser(user: any) {
  // You said you’re not enabling anonymous, but keep this guard anyway.
  return !!user && user.is_anonymous === false;
}
function isVerifiedUser(user: any) {
  return !!user?.email_confirmed_at;
}

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Support both old + new param names
  const next =
    sp.get("next") ||
    sp.get("returnTo") ||
    "/start";

  const initialEmail = sp.get("email") || "";

  const supabase = useMemo(() => getSupabase(), []);

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [msg, setMsg] = useState<string>("");
  const [msgKind, setMsgKind] = useState<"" | "ok" | "err">("");
  const [hint, setHint] = useState<string>("");
  const [showResend, setShowResend] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  const emailRedirectTo = () => {
    // Verify page will redirect back to `next`
    const base = `${window.location.origin}/verify`;
    const qs = `next=${encodeURIComponent(next)}`;
    return `${base}?${qs}`;
  };

  const goToNext = () => {
    router.replace(next.startsWith("/") ? next : "/start");
  };

  useEffect(() => {
    // If already logged in:
    // - verified real user => send to next
    // - unverified real user => keep here and show resend
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;

        if (isRealUser(user) && isVerifiedUser(user)) {
          goToNext();
          return;
        }

        if (isRealUser(user) && !isVerifiedUser(user)) {
          setMsg("Your account exists, but your email isn’t verified yet.");
          setMsgKind("err");
          setHint("Check your inbox for the verification email. You can also resend it below.");
          setShowResend(true);
          if (user?.email) setEmail(user.email);
        }
      } catch (e: any) {
        setMsg(e?.message || "Signup page failed to initialize.");
        setMsgKind("err");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setMsgKind("");
    setHint("");
    setShowResend(false);

    const em = email.trim();
    if (!em || !password) {
      setMsg("Please enter email and password.");
      setMsgKind("err");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: em,
        password,
        options: { emailRedirectTo: emailRedirectTo() },
      });

      if (error) throw error;

      // In some configs Supabase returns a session right away (no email confirm).
      // If it does, keep cookies synced for your API routes.
      if (data?.session) writeAuthCookies(data.session);

      setMsg("Confirm your email to finish signup.");
      setMsgKind("ok");
      setHint(
        "Open your inbox and click the confirmation link. After that, you’ll land on the verification page and we’ll bring you back to your draft."
      );
      setShowResend(true);
    } catch (err: any) {
      setMsg(err?.message || "Something went wrong. Please try again.");
      setMsgKind("err");
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    setMsg("");
    setMsgKind("");
    setHint("");

    const em = email.trim();
    if (!em) {
      setMsg("Enter your email above first.");
      setMsgKind("err");
      return;
    }

    setResendBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: em,
        options: { emailRedirectTo: emailRedirectTo() },
      });

      if (error) throw error;

      setMsg("Verification email sent. Check your inbox.");
      setMsgKind("ok");
      setHint("If you don’t see it in 2 minutes, check spam/junk.");
      setShowResend(true);
    } catch (err: any) {
      setMsg(err?.message || "Could not resend verification email.");
      setMsgKind("err");
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        :root{
          --text:#ffffff;
          --muted:rgba(255,255,255,.78);
          --card: rgba(15,18,24,.55);
          --card2: rgba(15,18,24,.38);
          --line: rgba(255,255,255,.14);
          --shadow: 0 22px 70px rgba(0,0,0,.55);
          --radius: 18px;
        }

        html, body { height:100%; }
        body{
          margin:0;
          font-family: Arial, sans-serif;
          color: var(--text);
          overflow-x:hidden;
          background:#0b0d12;
        }

        body::before{
          content:"";
          position:fixed;
          inset:0;
          z-index:-2;
          background: url("/assets/signup-hero.webp") center/cover no-repeat;
          transform: scale(1.03);
          filter: saturate(1.05) contrast(1.05);
        }

        body::after{
          content:"";
          position:fixed;
          inset:0;
          z-index:-1;
          background:
            radial-gradient(900px 600px at 20% 20%, rgba(0,0,0,.35), rgba(0,0,0,.72) 70%),
            linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.68));
          pointer-events:none;
        }
      `}</style>

      <main className="wrap">
        <h1>Create your account</h1>
        <p className="sub">Email + password. Your draft will carry over.</p>

        <div className="card">
          <form onSubmit={onSignup}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button type="submit" disabled={busy}>
              {busy ? "Creating account..." : "Sign up"}
            </button>

            <div className={`msg ${msgKind}`}>{msg}</div>
            <div className={`hint ${hint ? "show" : ""}`}>{hint}</div>

            <div className={`resendRow ${showResend ? "show" : ""}`}>
              <div style={{ color: "rgba(255,255,255,.78)", fontSize: 13, lineHeight: 1.45 }}>
                Didn’t get the verification email?
              </div>
              <button
                type="button"
                className="smallBtn"
                onClick={onResend}
                disabled={resendBusy}
              >
                {resendBusy ? "Sending..." : "Resend verification email"}
              </button>
            </div>

            <div className="row">
              <div>Already have an account?</div>
              <Link
                id="loginLink"
                href={`/login?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}
              >
                Log in
              </Link>
            </div>
          </form>
        </div>
      </main>

      <style jsx>{`
        .wrap{
          max-width: 520px;
          margin: 80px auto;
          padding: 0 20px;
          text-align: center;
        }

        h1{
          font-size: 40px;
          margin: 0 0 10px;
          font-weight: 900;
          letter-spacing: -0.03em;
          text-shadow: 0 18px 60px rgba(0,0,0,.55);
        }

        .sub{
          color: var(--muted);
          margin: 0 0 22px;
          line-height: 1.5;
          text-shadow: 0 14px 40px rgba(0,0,0,.55);
          font-size: 14px;
        }

        .card{
          border-radius: var(--radius);
          padding: 22px;
          text-align: left;
          background: linear-gradient(180deg, var(--card), var(--card2));
          border: 1px solid var(--line);
          box-shadow: var(--shadow);
          backdrop-filter: blur(14px);
        }

        label{
          display: block;
          font-size: 13px;
          margin: 12px 0 6px;
          color: rgba(255,255,255,.92);
          font-weight: 700;
        }

        input{
          width: 100%;
          padding: 12px 12px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 12px;
          font-size: 15px;
          outline: none;
          box-sizing: border-box;
          background: rgba(255,255,255,.06);
          color: #fff;
        }
        input::placeholder{ color: rgba(255,255,255,.55); }

        input:focus{
          border-color: rgba(255,255,255,.32);
          background: rgba(255,255,255,.08);
        }

        button{
          width: 100%;
          margin-top: 16px;
          padding: 12px 14px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 12px;
          font-size: 15px;
          font-weight: 900;
          background: rgba(255,255,255,.92);
          color: #0b0d12;
          cursor: pointer;
          transition: transform .12s ease, filter .12s ease;
        }
        button:hover{ transform: translateY(-1px); filter: brightness(1.02); }
        button:active{ transform: translateY(0px) scale(.99); }
        button:disabled{ opacity: 0.6; cursor: not-allowed; }

        .msg{
          margin-top: 12px;
          font-size: 13px;
          min-height: 18px;
          color: rgba(255,255,255,.85);
          line-height: 1.45;
        }
        .msg.ok{ color: #bff0bf; }
        .msg.err{ color: #ffb4b4; }

        .hint{
          margin-top: 10px;
          font-size: 12.5px;
          color: rgba(255,255,255,.72);
          line-height: 1.45;
          display:none;
        }
        .hint.show{ display:block; }

        .row{
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 14px;
          font-size: 13px;
          gap: 10px;
          flex-wrap: wrap;
          color: rgba(255,255,255,.78);
        }

        a{
          color: rgba(255,255,255,.88);
          text-decoration: none;
          border-bottom: 1px solid rgba(255,255,255,.28);
          padding-bottom: 2px;
        }
        a:hover{
          color: rgba(255,255,255,.96);
          border-bottom-color: rgba(255,255,255,.55);
        }

        .resendRow{
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,.12);
          display:none;
        }
        .resendRow.show{ display:block; }

        .smallBtn{
          width:auto;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06);
          color: rgba(255,255,255,.92);
          font-weight: 900;
          cursor:pointer;
          transition: transform .12s ease, background .12s ease;
          margin-top: 10px;
        }
        .smallBtn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.08); }
        .smallBtn:active{ transform: translateY(0px) scale(.99); }
        .smallBtn:disabled{ opacity:.6; cursor:not-allowed; }

        @media (max-width: 640px){
          .wrap{
            margin: 26px 16px;
            padding: 0;
          }
          h1{ font-size: 32px; }
          .card{ padding: 18px; }
        }
      `}</style>
    </>
  );
}