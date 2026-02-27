import { Suspense } from "react";
import Script from "next/script";
import LoginClient from "./LoginClient";
import LoginBackground from "./LoginBackground";

export default function LoginPage() {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="beforeInteractive"
      />
      <Script src="/account.js" strategy="beforeInteractive" />
      <Script src="/auth-guard.js" strategy="beforeInteractive" />

      <LoginBackground />
      <Suspense fallback={<div />}>
        <LoginClient />
      </Suspense>
    </>
  );
}