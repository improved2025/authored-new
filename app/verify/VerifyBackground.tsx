"use client";

export default function VerifyBackground() {
  return (
    <style jsx global>{`
      /* Verify page background: safe, minimal, no external assets */
      body {
        background: radial-gradient(1200px 800px at 20% 10%, rgba(255, 255, 255, 0.08), transparent 60%),
          radial-gradient(900px 700px at 80% 30%, rgba(255, 255, 255, 0.06), transparent 55%),
          linear-gradient(180deg, #0b0f19 0%, #070a12 100%);
        min-height: 100vh;
      }

      /* Ensure text remains readable */
      main {
        color: rgba(255, 255, 255, 0.92);
      }

      /* Buttons look decent even without a component library */
      button {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.18);
      }
      button:hover {
        background: rgba(255, 255, 255, 0.10);
      }
    `}</style>
  );
}