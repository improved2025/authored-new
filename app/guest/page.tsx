"use client";

import { useEffect } from "react";
import Link from "next/link";

function clean(v: any) {
  return (v ?? "").toString().trim();
}

export default function GuestPage() {
  // ✅ FIX: handler must be in component scope (NOT inside useEffect),
  // because JSX references it: onClick={handleEmailOutline}
  async function handleEmailOutline() {
    const leadEmailEl = document.getElementById("leadEmail") as HTMLInputElement | null;
    const leadMsg = document.getElementById("leadMsg") as HTMLDivElement | null;

    const setLeadMsg = (text: string) => {
      if (leadMsg) leadMsg.textContent = text || "";
    };

    const email = (leadEmailEl?.value || "").trim();
    if (!email) {
      setLeadMsg("Enter your email.");
      return;
    }

    const title = ((document.getElementById("titleOut") as HTMLElement | null)?.textContent || "").trim();
    const purpose = ((document.getElementById("purposeOut") as HTMLElement | null)?.textContent || "").trim();

    const outline = Array.from(document.querySelectorAll("#outlineOut li"))
      .map((li) => ({ title: (li.textContent || "").trim() }))
      .filter((x) => x.title);

    if (!outline.length) {
      setLeadMsg("Generate an outline first, then email it.");
      return;
    }

    try {
      setLeadMsg("Saving...");

      // ✅ Keep your existing endpoint/logic (no guessing, no new API names)
      const resp = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, title, purpose, outline, source: "guest_outline" }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setLeadMsg(`Could not save right now. (${(data as any)?.error || "error"})`);
        return;
      }

      if ((data as any).emailed) {
        setLeadMsg("Sent. Check your email.");
      } else if ((data as any).email_error) {
        setLeadMsg(`Saved, but email did not send yet. (${(data as any).email_error})`);
      } else {
        setLeadMsg("Saved. Email sending will be enabled shortly.");
      }
    } catch {
      setLeadMsg("Could not save right now. Please try again.");
    }
  }

  useEffect(() => {
    // Apply the premium background ONLY while this page is mounted
    document.documentElement.classList.add("guest-bg");
    document.body.classList.add("guest-body");
    return () => {
      document.documentElement.classList.remove("guest-bg");
      document.body.classList.remove("guest-body");
    };
  }, []);

  useEffect(() => {
    // ======= ORIGINAL INLINE SCRIPT (ported 1:1) =======

    // Genre quick-fill (safe: only writes to topic)
    (function initGenreButtons() {
      const topicEl = document.getElementById("topic") as HTMLTextAreaElement | null;
      if (!topicEl) return;

      const presets: Record<string, string> = {
        memoir: "I want to write a memoir about ",
        devotional: "I want to write a devotional focused on ",
        nonfiction: "I want to write a practical non-fiction book that helps people ",
        fiction: "I want to write a fiction story about ",
        inspirational: "I want to write an inspirational book that encourages readers to ",
      };

      const buttons = Array.from(document.querySelectorAll(".genre-btn")) as HTMLButtonElement[];
      if (!buttons.length) return;

      function setActive(btn: HTMLButtonElement) {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }

      buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-genre") || "";
          const text = presets[key] || "";
          setActive(btn);

          const current = (topicEl.value || "").trim();
          if (!current) {
            topicEl.value = text;
          } else {
            const tag = `Genre: ${btn.textContent}.`;
            if (!current.toLowerCase().includes("genre:")) {
              topicEl.value = current + "\n\n" + tag;
            }
          }

          topicEl.focus();
          topicEl.setSelectionRange(topicEl.value.length, topicEl.value.length);
        });
      });
    })();

    function getSelectedGenreLabel() {
      const active = document.querySelector(".genre-btn.active") as HTMLButtonElement | null;
      return active ? active.textContent?.trim() || "" : "";
    }

    function buildReflectionText({
      topic,
      audience,
      blocker,
      genre,
    }: {
      topic: string;
      audience: string;
      blocker: string;
      genre: string;
    }) {
      const genrePhrase = genre ? `${genre.toLowerCase()}-style book` : "book";
      const aud = audience ? `meant for ${audience}` : "meant for readers you care about";
      const top = topic ? `around ${topic}` : "around a message you’re still shaping";
      const block = blocker
        ? `what’s slowed you down most is ${blocker}`
        : "what’s slowed you down most is clarity and confidence";

      return `You’re working on a ${genrePhrase} ${aud} ${top}. Your goal is to encourage forward movement, and ${block}.`;
    }

    function showReflectionGate(text: string) {
      const gate = document.getElementById("reflectionGate") as HTMLDivElement | null;
      const p = document.getElementById("reflectionText") as HTMLParagraphElement | null;
      if (!gate || !p) return;

      p.textContent = text;
      gate.style.display = "block";
      gate.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function hideReflectionGate() {
      const gate = document.getElementById("reflectionGate") as HTMLDivElement | null;
      if (gate) gate.style.display = "none";
    }

    function getPayloadFromForm() {
      const topic = clean((document.getElementById("topic") as HTMLTextAreaElement | null)?.value);
      const audience = clean((document.getElementById("audience") as HTMLInputElement | null)?.value);
      const blocker = clean((document.getElementById("blocker") as HTMLInputElement | null)?.value);
      const chapters = parseInt(
        clean((document.getElementById("chapters") as HTMLSelectElement | null)?.value),
        10
      );
      const voiceSample = clean(
        (document.getElementById("voiceSample") as HTMLTextAreaElement | null)?.value
      );
      const voiceNotes = clean((document.getElementById("voiceNotes") as HTMLInputElement | null)?.value);

      return {
        topic,
        audience,
        blocker,
        chapters: Number.isFinite(chapters) ? chapters : 12,
        voiceSample,
        voiceNotes,
      };
    }

    function savePendingToLocalStorage(extra: Record<string, any> = {}) {
      const base = getPayloadFromForm();
      const pending = { ...base, ...extra, savedAt: new Date().toISOString(), source: "guest" };
      localStorage.setItem("authored_pending", JSON.stringify(pending));
    }

    function goToAuth(which: "signup" | "login") {
      // Next route equivalent of your old returnTo=start.html
      const next = encodeURIComponent("/start");
      window.location.href = `/${which}?next=${next}`;
    }

    async function generateOutline() {
      const payload = getPayloadFromForm();
      if (!payload.topic) {
        alert("Type what you want to write about.");
        return;
      }

      const result = document.getElementById("result") as HTMLDivElement | null;
      const titleOut = document.getElementById("titleOut") as HTMLElement | null;
      const purposeOut = document.getElementById("purposeOut") as HTMLElement | null;
      const outlineOut = document.getElementById("outlineOut") as HTMLOListElement | null;

      if (result) result.style.display = "block";
      if (titleOut) titleOut.textContent = "Generating...";
      if (purposeOut) purposeOut.textContent = "Please wait...";
      if (outlineOut) outlineOut.innerHTML = "<li>Creating your outline...</li>";

      try {
        const resp = await fetch("/api/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Request failed");

        const title = data.title || "Untitled";
        const purpose = data.purpose || "";
        const outline = Array.isArray(data.outline) ? data.outline : [];

        if (titleOut) titleOut.textContent = title;
        if (purposeOut) purposeOut.textContent = purpose;

        if (outlineOut) {
          outlineOut.innerHTML = "";
          outline.forEach((item: any, idx: number) => {
            const li = document.createElement("li");
            li.textContent = item?.title || `Chapter ${idx + 1}`;
            outlineOut.appendChild(li);
          });
        }

        savePendingToLocalStorage({ title, purpose, outline });

        if (result) result.scrollIntoView({ behavior: "smooth" });
      } catch {
        if (titleOut) titleOut.textContent = "Could not create outline";
        if (purposeOut) purposeOut.textContent = "Something went wrong. Please try again.";
        if (outlineOut) outlineOut.innerHTML = "<li>Error generating outline.</li>";
      }
    }

    const beginBtn = document.getElementById("beginBtn") as HTMLButtonElement | null;
    const reflectionContinue = document.getElementById("reflectionContinue") as HTMLButtonElement | null;
    const reflectionAdjust = document.getElementById("reflectionAdjust") as HTMLButtonElement | null;
    const createAccountBtn = document.getElementById("createAccountBtn") as HTMLButtonElement | null;
    const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement | null;

    beginBtn?.addEventListener("click", () => {
      const payload = getPayloadFromForm();
      const genre = getSelectedGenreLabel();

      const reflection = buildReflectionText({
        topic: payload.topic,
        audience: payload.audience,
        blocker: payload.blocker,
        genre,
      });

      const result = document.getElementById("result") as HTMLDivElement | null;
      if (result) result.style.display = "none";

      showReflectionGate(reflection);
    });

    reflectionContinue?.addEventListener("click", async () => {
      hideReflectionGate();
      await generateOutline();
    });

    reflectionAdjust?.addEventListener("click", () => {
      hideReflectionGate();
      const topicEl = document.getElementById("topic") as HTMLTextAreaElement | null;
      if (topicEl) {
        topicEl.scrollIntoView({ behavior: "smooth", block: "center" });
        topicEl.focus();
      }
    });

    createAccountBtn?.addEventListener("click", () => {
      savePendingToLocalStorage();
      goToAuth("signup");
    });

    loginBtn?.addEventListener("click", () => {
      savePendingToLocalStorage();
      goToAuth("login");
    });

    // ✅ IMPORTANT SURGICAL CHANGE:
    // We REMOVED the old "emailOutlineBtn.addEventListener" block because the button
    // now uses React onClick={handleEmailOutline}. No duplicate handlers, no scope issues.

    // Cleanup listeners is intentionally omitted here to preserve 1:1 behavior during migration.
  }, []);

  return (
    <>
      <style jsx global>{`
        /* ===== Page-scoped globals via html/body class ===== */

        html.guest-bg,
        html.guest-bg body.guest-body {
          min-height: 100%;
        }

        html.guest-bg,
        body.guest-body {
          max-width: 100%;
          overflow-x: hidden;
        }

        /* Full-screen photo behind everything */
        html.guest-bg::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -2;
          background: url("/assets/hero-guest.webp") center/cover no-repeat;
          transform: scale(1.03);
          filter: saturate(1.05) contrast(1.05);
        }

        /* Dark overlay so the photo feels premium */
        html.guest-bg::after {
          content: "";
          position: fixed;
          inset: 0;
          z-index: -1;
          background: radial-gradient(1200px 800px at 15% 20%, rgba(0, 0, 0, 0.22), rgba(0, 0, 0, 0.58) 70%),
            linear-gradient(180deg, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.55));
          pointer-events: none;
        }

        /* Turn the body into a readable dark-glass card */
        body.guest-body {
          font-family: Arial, sans-serif;
          margin: 48px;
          max-width: 900px;
          background: linear-gradient(180deg, rgba(10, 12, 16, 0.78), rgba(10, 12, 16, 0.66));
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(10px);
        }

        @media (max-width: 640px) {
          body.guest-body {
            margin: 22px 16px;
            padding: 16px;
            border-radius: 16px;
          }

          html.guest-bg::after {
            background: radial-gradient(1200px 800px at 15% 20%, rgba(0, 0, 0, 0.28), rgba(0, 0, 0, 0.66) 70%),
              linear-gradient(180deg, rgba(0, 0, 0, 0.36), rgba(0, 0, 0, 0.66));
          }
        }

        /* ===== Original embedded CSS (kept intact, scoped where safe) ===== */
        .site-header {
          display: flex;
          align-items: center;
          margin-bottom: 24px;
        }
        .logo-wrap {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          max-width: 100%;
        }
        .logo-wrap img {
          height: 36px;
          width: auto;
          display: block;
        }
        @media (max-width: 640px) {
          .site-header {
            margin-bottom: 18px;
          }
          .logo-wrap img {
            height: 32px;
          }
        }

        h1 {
          margin: 0 0 8px;
          color: #f5f7fb;
          text-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          line-height: 1.15;
          letter-spacing: -0.02em;
          overflow-wrap: anywhere;
        }
        h2,
        h3 {
          color: #f5f7fb;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }
        p {
          color: rgba(245, 247, 251, 0.9);
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        label {
          display: block;
          font-weight: 700;
          margin-top: 14px;
          color: #f5f7fb;
          text-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          overflow-wrap: anywhere;
        }
        input[type="text"],
        input[type="email"],
        textarea,
        select {
          width: 100%;
          max-width: 100%;
          padding: 12px 14px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          font-size: 15px;
          background: rgba(255, 255, 255, 0.96);
          color: #111;
          box-sizing: border-box;
        }
        textarea {
          min-height: 92px;
          resize: vertical;
        }
        .row {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .btn {
          padding: 11px 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          text-decoration: none;
          min-height: 44px;
        }
        .btn.secondary {
          background: rgba(255, 255, 255, 0.96);
          color: #111;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .muted {
          color: rgba(245, 247, 251, 0.76) !important;
          font-size: 13px;
        }
        hr {
          margin: 18px 0;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
        }
        .notice {
          background: #fff7d6;
          border: 1px solid #f2d27a;
          padding: 12px 14px;
          border-radius: 14px;
          margin: 14px 0 18px;
          color: #5a4600;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
        }
        .notice .muted {
          color: rgba(90, 70, 0, 0.88) !important;
        }
        #result {
          display: none;
          margin-top: 18px;
        }
        .card {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(8px);
        }
        .pill {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-size: 12px;
          color: rgba(245, 247, 251, 0.9);
          margin-right: 8px;
          margin-bottom: 6px;
          background: rgba(255, 255, 255, 0.05);
        }
        ol,
        ul {
          padding-left: 18px;
        }
        li {
          color: rgba(245, 247, 251, 0.92);
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        pre {
          white-space: pre-wrap;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.16);
          padding: 12px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.45;
          color: #111;
          max-width: 100%;
          overflow-x: auto;
        }

        /* Genre buttons */
        .quickstart {
          margin: 8px 0 10px;
        }
        .quickstart-note {
          font-size: 13px;
          color: rgba(245, 247, 251, 0.82) !important;
          margin-bottom: 8px;
        }
        .quickstart-sub {
          font-size: 12px;
          color: rgba(245, 247, 251, 0.68) !important;
          margin-top: 8px;
        }
        .genre-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .genre-btn {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.96);
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 13px;
          cursor: pointer;
          color: #111;
          min-height: 42px;
        }
        .genre-btn:hover {
          background: #f6f6f6;
        }
        .genre-btn.active {
          border-color: #111;
          background: #111;
          color: #fff;
        }

        input::placeholder,
        textarea::placeholder {
          color: #777;
        }

        @media (max-width: 640px) {
          h1 {
            font-size: 31px;
            line-height: 1.08;
            margin-bottom: 10px;
          }
          h2 {
            font-size: 24px;
            line-height: 1.12;
          }
          h3 {
            font-size: 20px;
            line-height: 1.15;
          }
          p,
          label,
          .muted,
          .quickstart-note,
          .quickstart-sub {
            max-width: 100%;
          }
          .row {
            gap: 10px;
          }
          .row > div[style] {
            min-width: 0 !important;
            width: 100%;
          }
          .row > div[style*="display: flex"] {
            width: 100%;
            flex-direction: column;
            align-items: stretch !important;
          }
          .row > div[style*="display: flex"] > * {
            width: 100%;
          }
          .actions {
            flex-direction: column;
            align-items: stretch;
          }
          .actions .btn,
          .actions button,
          .actions a {
            width: 100%;
            text-align: center;
          }
          #leadEmail {
            min-width: 0 !important;
          }
          .genre-row {
            gap: 8px;
          }
          .genre-btn {
            padding: 9px 14px;
            font-size: 12.5px;
          }
          .card {
            padding: 14px;
          }
          .notice {
            padding: 12px;
            border-radius: 12px;
          }
        }
      `}</style>

      {/* ===== Exact markup (IDs/classes/text preserved) ===== */}
      <header className="site-header">
        <Link href="/" className="logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo-authored.png" alt="Authored" />
        </Link>
      </header>

      <h1>Start your book (free outline)</h1>
      <p className="muted">
        Authored is not writing for you. It is writing with you. You bring the message. Authored helps you shape it.
      </p>

      <div className="notice">
        <strong>Free:</strong> Generate an outline without an account.
        <br />
        <span className="muted">Account required for expansions, introductions, and downloads.</span>
      </div>

      <label>What do you want to write about?</label>

      <div className="quickstart">
        <div className="quickstart-note">Optional: pick a genre to get started faster.</div>
        <div className="genre-row" role="group" aria-label="Quick start genres">
          <button type="button" className="genre-btn" data-genre="memoir">
            Memoir
          </button>
          <button type="button" className="genre-btn" data-genre="devotional">
            Devotional
          </button>
          <button type="button" className="genre-btn" data-genre="nonfiction">
            Non-fiction
          </button>
          <button type="button" className="genre-btn" data-genre="fiction">
            Fiction
          </button>
          <button type="button" className="genre-btn" data-genre="inspirational">
            Inspirational
          </button>
        </div>
        <div className="quickstart-sub">You can ignore these and just type your idea.</div>
      </div>

      <textarea id="topic" placeholder="It’s okay if you’re not sure yet." />

      <label>Who is this for?</label>
      <input id="audience" type="text" placeholder="Who do you want to reach?" />

      <label>What’s been stopping you from writing?</label>
      <input id="blocker" type="text" placeholder="Fear, time, clarity, confidence..." />

      <hr />

      <h3 style={{ margin: "0 0 8px" }}>Your voice</h3>
      <p className="muted" style={{ margin: "0 0 10px" }}>
        Optional but recommended. Paste a short sample of your writing so Authored can match your tone.
      </p>

      <label>Your writing sample</label>
      <textarea id="voiceSample" placeholder="Paste a sermon excerpt, blog post, letter, or chapter draft." />

      <label>Voice notes</label>
      <input
        id="voiceNotes"
        type="text"
        placeholder="Example: warm, pastoral, simple, no fluff, avoid robotic tone."
      />

      <hr />

      <div className="row">
        <div style={{ minWidth: 260, flex: 1 }}>
          <label style={{ marginTop: 0 }}>How many chapters?</label>
          <select id="chapters" defaultValue="12">
            <option value="5">5</option>
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="12">12</option>
            <option value="15">15</option>
          </select>
          <div className="muted">Start small. You can expand later.</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <button className="btn" id="beginBtn" type="button">
            Let’s shape a starting point
          </button>
          <Link href="/" style={{ alignSelf: "center", color: "rgba(245,247,251,.86)" }}>
            Back to home
          </Link>
        </div>
      </div>

      {/* Reflection gate (NEW) */}
      <div id="reflectionGate" className="card" style={{ display: "none", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 6px" }}>Let’s make sure I understand</h3>
        <p id="reflectionText" style={{ margin: "0 0 10px", lineHeight: 1.55 }} />
        <p className="muted" style={{ margin: "0 0 12px", fontWeight: 700 }}>
          Does this sound right?
        </p>
        <div className="actions">
          <button className="btn" id="reflectionContinue" type="button">
            Yes, continue
          </button>
          <button className="btn secondary" id="reflectionAdjust" type="button">
            Let me adjust
          </button>
        </div>
      </div>

      <div id="result">
        <hr />
        <p>
          <strong>Done.</strong> Here’s your starting point.
        </p>

        <div className="card">
          <div>
            <span className="pill">Working title</span>
            <span className="pill">Starter outline</span>
          </div>

          <h2 id="titleOut" style={{ margin: "10px 0 6px" }}>
            Generating...
          </h2>

          <h3 style={{ margin: "14px 0 6px" }}>One-sentence purpose</h3>
          <p id="purposeOut">Please wait...</p>
          <div className="muted" style={{ marginTop: -6 }}>
            Does this reflect what you want to say?
          </div>

          <h3 style={{ margin: "14px 0 6px" }}>Outline</h3>
          <div className="muted" style={{ margin: "-4px 0 8px" }}>
            Here’s one possible way to structure this.
          </div>
          <ol id="outlineOut">
            <li>Creating your outline...</li>
          </ol>

          {/* ADDED: inline lead capture */}
          <div className="card" style={{ marginTop: 14, borderStyle: "dashed" }}>
            <h3 style={{ margin: "0 0 8px" }}>Save this outline</h3>
            <p className="muted" style={{ margin: "0 0 10px" }}>
              Enter your email and we’ll send this outline to you so you don’t lose it.
            </p>

            <div className="row" style={{ marginTop: 0 }}>
              <input
                id="leadEmail"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="btn secondary" id="emailOutlineBtn" type="button" onClick={handleEmailOutline}>
                Email me my outline
              </button>
            </div>

            <div id="leadMsg" className="muted" style={{ marginTop: 10, minHeight: 18 }} />

            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              One email now. Encouragement later. Unsubscribe anytime.
            </div>
          </div>

          <div className="notice" style={{ marginTop: 14 }}>
            <strong>Want chapter drafts, intro, and downloads?</strong>
            <br />
            Create a free account to continue and we’ll save this project for you.
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn" id="createAccountBtn" type="button">
                Create free account
              </button>
              <button className="btn secondary" id="loginBtn" type="button">
                Log in
              </button>
            </div>
          </div>

          <pre id="debugOut" style={{ display: "none" }} />
        </div>
      </div>
    </>
  );
}