import { Suspense } from "react";
import SignupClient from "./SignupClient";
import SignupBackground from "./SignupBackground";

export default function SignupPage() {
  return (
    <>
      <SignupBackground />
      <Suspense fallback={<div />}>
        <SignupClient />
      </Suspense>
    </>
  );
}