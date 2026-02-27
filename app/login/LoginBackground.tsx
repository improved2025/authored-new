"use client";

export default function LoginBackground() {
  return (
    <style jsx global>{`
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #0b0d12;
        color: white;
        overflow-x: hidden;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -2;
        background: url("/assets/signup-hero.webp") center/cover no-repeat;
        transform: scale(1.03);
        filter: saturate(1.05) contrast(1.05);
      }

      body::after {
        content: "";
        position: fixed;
        inset: 0;
        z-index: -1;
        background:
          radial-gradient(900px 600px at 20% 20%, rgba(0,0,0,.35), rgba(0,0,0,.72) 70%),
          linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.68));
      }
    `}</style>
  );
}