"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Status = "loading" | "no_session" | "unverified" | "error";

function isEmailConfirmed(user: any) {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

export default function VerifyClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const next = useMemo(() => {
    const n = (sp.get("next") || "").trim();
    return n || "/start";
  }, [sp]);

  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function check() {
    setStatus("loading");
    setMsg("");

    // Helps after user clicks the verification email link (session can be stale)
    await supabase.auth.refreshSession().catch(() => null);

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setStatus("error");
      setMsg(error.message || "Unable to read session.");
      return;
    }

    const user = data?.user;
    if (!user) {
      setStatus("no_session");
      return;
    }

    setEmail(user.email || "");

    if (isEmailConfirmed(user)) {
      router.replace(next);
      return;
    }

    setStatus("unverified");
  }

  async function resend() {
    setMsg("");
    setStatus("loading");

    if (!email) {
      setMsg("Your email isn’t available. Please log in again, then return here.");
      setStatus("unverified");
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    } as any);

    if (error) {
      setMsg(error.message || "Could not resend verification email.");
      setStatus("unverified");
      return;
    }

    setMsg("Verification email sent. Check your inbox (and spam/junk).");
    setStatus("unverified");
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

  if (status === "no_session") {
    return (
      <main className="relative z-10 mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold">Please log in</h1>
        <p className="mt-2 opacity-80">
          You need to be logged in to verify your account.
        </p>
        <button
          className="mt-4 rounded-md border px-4 py-2"
          onClick={() => router.replace(`/login?next=/verify`)}
        >
          Go to login
        </button>
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
            onClick={() => router.replace(`/login?next=/verify`)}
          >
            Log in again
          </button>
        </div>
      </main>
    );
  }

  // unverified
  return (
    <main className="relative z-10 mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 opacity-80">
        We sent a verification link to{" "}
        <span className="font-medium">{email || "your email"}</span>. Click it,
        then return here.
      </p>

      {msg ? <p className="mt-3 text-sm opacity-80">{msg}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-md border px-4 py-2" onClick={check}>
          I verified already
        </button>
        <button className="rounded-md border px-4 py-2" onClick={resend}>
          Resend email
        </button>
        <button
          className="rounded-md border px-4 py-2"
          onClick={() => router.replace(next)}
        >
          Continue
        </button>
      </div>
    </main>
  );
}