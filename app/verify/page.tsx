"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function setCookie(name: string, value: string, maxAgeSeconds?: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const maxAge =
    typeof maxAgeSeconds === "number" ? `; Max-Age=${maxAgeSeconds}` : "";
  document.cookie = `${name}=${encodeURIComponent(
    value || ""
  )}; Path=/; SameSite=Lax${maxAge}${secure}`;
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

export default function VerifyPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/start";

  const [status, setStatus] = useState("Verifying...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1) Newer Supabase email links often include ?code=...
        const code = sp.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(
            code
          );
          if (error) throw error;

          writeAuthCookies(data?.session);
          if (cancelled) return;

          setStatus("Email verified. Redirecting...");
          setTimeout(() => router.replace(next), 700);
          return;
        }

        // 2) Older links may include access_token/refresh_token in hash
        // Example: /verify#access_token=...&refresh_token=...
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;

          writeAuthCookies(data?.session);
          if (cancelled) return;

          setStatus("Email verified. Redirecting...");
          setTimeout(() => router.replace(next), 700);
          return;
        }

        // 3) Fallback: user already has a session (rare but possible)
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const confirmed = !!data?.session?.user?.email_confirmed_at;
        if (!confirmed) {
          setStatus(
            "We couldn’t verify this link. Try opening the verification email again, or log in."
          );
          return;
        }

        writeAuthCookies(data?.session);
        setStatus("Email verified. Redirecting...");
        setTimeout(() => router.replace(next), 700);
      } catch (err: any) {
        setStatus(
          `Verification failed: ${err?.message || "unknown error"}`
        );
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router, sp, next]);

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1>Verify Email</h1>
      <p style={{ opacity: 0.85 }}>{status}</p>

      {status.toLowerCase().includes("failed") ||
      status.toLowerCase().includes("couldn’t") ? (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => router.replace(`/login?next=${encodeURIComponent(next)}`)}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Go to login
          </button>
        </div>
      ) : null}
    </main>
  );
}