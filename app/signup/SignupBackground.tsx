"use client";

export default function SignupBackground() {
  return (
    <style jsx global>{`
      :root{
        --text:#ffffff;
        --muted:rgba(255,255,255,.78);
        --card: rgba(15,18,24,.55);
        --card2: rgba(15,18,24,.38);
        --line: rgba(255,255,255,.14);
        --shadow: 0 22px 70px rgba(0,0,0,.55);
        --radius: 18px;
      }

      html, body { height:100%; }
      body{
        margin:0;
        font-family: Arial, sans-serif;
        color: var(--text);
        overflow-x:hidden;
        background:#0b0d12;
      }

      body::before{
        content:"";
        position:fixed;
        inset:0;
        z-index:-2;
        background: url("/assets/signup-hero.webp") center/cover no-repeat;
        transform: scale(1.03);
        filter: saturate(1.05) contrast(1.05);
      }

      body::after{
        content:"";
        position:fixed;
        inset:0;
        z-index:-1;
        background:
          radial-gradient(900px 600px at 20% 20%, rgba(0,0,0,.35), rgba(0,0,0,.72) 70%),
          linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.68));
        pointer-events:none;
      }
    `}</style>
  );
}