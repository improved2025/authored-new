import { Suspense } from "react";
import LoginClient from "./LoginClient";
import LoginBackground from "./LoginBackground";

export default function LoginPage() {
  return (
    <>
      <LoginBackground />
      <Suspense fallback={<div />}>
        <LoginClient />
      </Suspense>
    </>
  );
}