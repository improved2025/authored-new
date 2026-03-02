import { Suspense } from "react";
import VerifyClient from "./VerifyClient";
import VerifyBackground from "./VerifyBackground";

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <>
      <VerifyBackground />
      <Suspense fallback={<div />}>
        <VerifyClient />
      </Suspense>
    </>
  );
}