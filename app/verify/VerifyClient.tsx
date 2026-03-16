"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Status = "loading" | "unverified" | "expired_or_invalid" | "error";

function isEmailConfirmed(user: any) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

function readHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash || "";
  return new URLSearchParams(raw);
}

function cleanPath(next: string) {
  const n = (next || "").trim();
  if (!n) return "/start";
  return n.startsWith("/") ? n : "/start";
}

function buildCleanVerifyUrl(next: string) {
  return `/verify?next=${encodeURIComponent(next)}`;
}

export default function VerifyClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => cleanPath(sp.get("next") || "/start"), [sp]);

  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function establishSessionFromUrl() {
    const code = sp.get("code") || "";
    const token_hash = sp.get("token_hash") || "";
    const type = (sp.get("type") || "").trim();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanVerifyUrl(next));
      return true;
    }

    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanVerifyUrl(next));
      return true;
    }

    const hash = readHashParams();
    const access_token = hash.get("access_token") || "";
    const refresh_token = hash.get("refresh_token") || "";

    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) throw error;

      window.history.replaceState({}, "", buildCleanVerifyUrl(next));
      return true;
    }

    return false;
  }

  async function check() {
    setStatus("loading");
    setMsg("");

    try {
      const hadAuthParams =
        Boolean(sp.get("code")) ||
        Boolean(sp.get("token_hash")) ||
        Boolean(readHashParams().get("access_token"));

      if (hadAuthParams) {
        await establishSessionFromUrl();
      }

      const { data: userData, error } = await supabase.auth.getUser();
      if (error) throw error;

      const user = userData?.user ?? null;

      if (!user) {
        setStatus(hadAuthParams ? "expired_or_invalid" : "unverified");
        setMsg(
          hadAuthParams
            ? "This verification link is invalid, expired, or has already been used."
            : "Please check your inbox and click the verification link."
        );
        return;
      }

      setEmail(user.email || "");

      if (isEmailConfirmed(user)) {
        router.replace(next);
        return;
      }

      setStatus("unverified");
      setMsg("Your account is not verified yet. Please check your inbox.");
    } catch (e: any) {
      setStatus("error");
      setMsg(e?.message || "Could not verify this link.");
    }
  }

  async function resend() {
    setMsg("");

    if (!email) {
      setStatus("error");
      setMsg("We could not determine your email address. Please log in again.");
      return;
    }

    setStatus("loading");

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/verify?next=${encodeURIComponent(next)}`
        : undefined;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    } as any);

    if (error) {
      setStatus("unverified");
      setMsg(error.message || "Could not resend verification email.");
      return;
    }

    setStatus("unverified");
    setMsg("Verification email sent. Check inbox and spam/junk.");
  }

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <main className="relative z-10 mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Checking your account…</h1>
        <p className="mt-2 opacity-80">One moment.</p>
      </main>
    );
  }

  if (status === "expired_or_invalid") {
    return (
      <main className="relative z-10 mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Verification link problem</h1>
        <p className="mt-2 opacity-80">{msg}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-md border px-4 py-2" onClick={check}>
            Retry
          </button>
          <button
            className="rounded-md border px-4 py-2"
            onClick={() => router.replace("/login")}
          >
            Go to login
          </button>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="relative z-10 mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 opacity-80">{msg || "Please try again."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-md border px-4 py-2" onClick={check}>
            Retry
          </button>
          <button
            className="rounded-md border px-4 py-2"
            onClick={() => router.replace("/login")}
          >
            Log in again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 opacity-80">
        We sent a verification link to{" "}
        <span className="font-medium">{email || "your email"}</span>.
      </p>

      {msg ? <p className="mt-3 text-sm opacity-80">{msg}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-md border px-4 py-2" onClick={check}>
          I verified already
        </button>
        <button className="rounded-md border px-4 py-2" onClick={resend}>
          Resend email
        </button>
      </div>
    </main>
  );
}