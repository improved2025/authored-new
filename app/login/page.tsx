import { Suspense } from "react";
import LoginClient from "./LoginClient";
import LoginBackground from "./LoginBackground";

export default function LoginPage() {
  return (
    <>
      <LoginBackground />
      <Suspense fallback={<div style={{ padding: 24, color: "white" }}>Loading…</div>}>
        <LoginClient />
      </Suspense>
    </>
  );
}