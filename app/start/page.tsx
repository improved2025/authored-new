"use client";

import Script from "next/script";
import { useEffect } from "react";

export default function StartPage() {
  useEffect(() => {
    // Helpers
    const $ = (id: string) => document.getElementById(id) as any;
    const clean = (v: any) => (v ?? "").toString().trim();

    const safeJson = async (resp: Response) => {
      try {
        return await resp.json();
      } catch {
        return {};
      }
    };

    // ✅ FIX: Always return a plain string map (never optional undefined fields)
    const authHeaders = async (): Promise<Record<string, string>> => {
      try {
        const client = (window as any).AuthoredAccount?.client;
        if (!client?.auth?.getSession) return {};
        const { data } = await client.auth.getSession();
        const token = data?.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      } catch {
        return {};
      }
    };

    // ✅ START PAGE AUTH GATE (prevents guests from using /start)
    (async function requireLoginForStart() {
      try {
        const account = (window as any).AuthoredAccount;
        const client = account?.client;

        // account.js loads via <Script beforeInteractive>, but on first paint it can still be racing.
        if (!client?.auth?.getSession) {
          setTimeout(() => requireLoginForStart(), 50);
          return;
        }

        const { data } = await client.auth.getSession();
        const user = data?.session?.user || null;

        // Start page is logged-in only
        if (!user) {
          window.location.replace("/login");
          return;
        }

        // If anon ever exists, block it
        if (user.is_anonymous) {
          window.location.replace("/login");
          return;
        }

        // Must be verified
        if (!user.email_confirmed_at) {
          window.location.replace("/verify");
          return;
        }
      } catch {
        window.location.replace("/login");
      }
    })();

    const showUpgrade = (reason?: string) => {
      const box = $("upgradeBox");
      const msg = $("upgradeMsg");
      if (!box || !msg) return;

      msg.textContent =
        reason || "You’ve reached the free plan limit for this feature.";
      box.style.display = "block";
      box.scrollIntoView({ behavior: "smooth", block: "start" });

      const disableIds = [
        "expandBtn",
        "regenExpandedBtn",
        "genIntroBtn",
        "genTitlesBtn",
      ];
      disableIds.forEach((id) => {
        const b = $(id);
        if (b) b.disabled = true;
      });
    };

    const isLimitReachedError = (data: any) =>
      data &&
      (data.error === "limit_reached" ||
        data.error === "limit_reached_today" ||
        data.error === "project_locked");

    const buildReflectionText = ({
      topic,
      audience,
      blocker,
      genre,
    }: {
      topic: string;
      audience: string;
      blocker: string;
      genre: string;
    }) => {
      const genrePhrase = genre ? `${genre.toLowerCase()}-style book` : "book";
      const aud = audience ? `meant for ${audience}` : "meant for readers you care about";
      const top = topic ? `around ${topic}` : "around a message you’re still shaping";
      const block = blocker
        ? `what’s slowed you down most is ${blocker}`
        : "what’s slowed you down most is clarity and confidence";

      return `You’re working on a ${genrePhrase} ${aud} ${top}. Your goal is to encourage forward movement, and ${block}.`;
    };

    const showReflectionGate = (text: string) => {
      const gate = $("reflectionGate");
      const p = $("reflectionText");
      if (!gate || !p) return;

      p.textContent = text;
      gate.style.display = "block";
      gate.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const hideReflectionGate = () => {
      const gate = $("reflectionGate");
      if (gate) gate.style.display = "none";
    };

    const getSelectedGenreLabel = () => {
      const active = document.querySelector(".genre-btn.active") as HTMLElement | null;
      return active ? clean(active.textContent) : "";
    };

    // ===== Restore last start + promote guest pending (YOUR ORIGINAL LOGIC) =====
    (function restoreLastStart() {
      try {
        const pendingRaw = localStorage.getItem("authored_pending");
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw);
          if (pending && Array.isArray(pending.outline) && pending.outline.length) {
            localStorage.setItem(
              "authored_last_start",
              JSON.stringify({
                savedAt: pending.savedAt || new Date().toISOString(),
                title: pending.title || "Untitled",
                purpose: pending.purpose || "",
                outline: pending.outline || [],
                topic: pending.topic || "",
                audience: pending.audience || "",
                blocker: pending.blocker || "",
                chapters: pending.chapters || 12,
                voiceSample: pending.voiceSample || "",
                voiceNotes: pending.voiceNotes || "",
              })
            );
            localStorage.removeItem("authored_pending");
          }
        }

        const raw = localStorage.getItem("authored_last_start");
        if (!raw) return;

        const s = JSON.parse(raw);
        if (!s || !Array.isArray(s.outline) || !s.outline.length) return;

        const emptyState = $("emptyState");
        if (emptyState) emptyState.style.display = "none";

        if ($("topic")) $("topic").value = s.topic || "";
        if ($("audience")) $("audience").value = s.audience || "";
        if ($("blocker")) $("blocker").value = s.blocker || "";
        if ($("chapters") && s.chapters) $("chapters").value = String(s.chapters);
        if ($("voiceSample")) $("voiceSample").value = s.voiceSample || "";
        if ($("voiceNotes")) $("voiceNotes").value = s.voiceNotes || "";

        (window as any).__title = s.title || "Untitled";
        (window as any).__purpose = s.purpose || "";
        (window as any).__outlineItems = s.outline || [];

        const result = $("result");
        if (result) result.style.display = "block";

        const titleOut = $("titleOut");
        if (titleOut) titleOut.textContent = (window as any).__title;

        const purposeOut = $("purposeOut");
        if (purposeOut) purposeOut.textContent = (window as any).__purpose;

        const list = $("outlineOut");
        if (list) {
          list.innerHTML = "";
          (window as any).__outlineItems.forEach((item: any, idx: number) => {
            const li = document.createElement("li");
            li.textContent = item?.title || `Chapter ${idx + 1}`;
            list.appendChild(li);
          });
        }

        const picker = $("chapterPick");
        if (picker) {
          picker.innerHTML = "";
          (window as any).__outlineItems.forEach((item: any, idx: number) => {
            const opt = document.createElement("option");
            opt.value = String(idx);
            opt.textContent = `Chapter ${idx + 1}: ${item?.title || `Chapter ${idx + 1}`}`;
            picker.appendChild(opt);
          });
        }
      } catch {}
    })();

    // ===== Core outline generation (YOUR ORIGINAL FLOW, FIXED STRINGS ONLY) =====
    async function runOutlineGeneration() {
      const emptyState = $("emptyState");
      if (emptyState) emptyState.style.display = "none";

      const topic = clean($("topic")?.value);
      const audience = clean($("audience")?.value);
      const blocker = clean($("blocker")?.value);
      const chapters = parseInt($("chapters")?.value, 10) || 12;

      const voiceSample = clean($("voiceSample")?.value);
      const voiceNotes = clean($("voiceNotes")?.value);

      (window as any).__lastOutlinePayload = { topic, audience, blocker, chapters, voiceSample, voiceNotes };

      $("result").style.display = "block";
      $("titleOut").textContent = "Generating...";
      $("purposeOut").textContent = "Please wait...";
      $("outlineOut").innerHTML = "<li>Creating your outline...</li>";

      $("expandedOut").textContent = "Choose a chapter and click Expand.";
      $("copyExpandedBtn").disabled = true;
      $("downloadExpandedBtn").disabled = true;
      $("regenExpandedBtn").disabled = true;

      $("titleIdeasOut").innerHTML = "";
      $("introOut").textContent = 'Click “Generate introduction” to create an optional intro.';
      $("copyIntroBtn").disabled = true;
      $("downloadIntroBtn").disabled = true;

      (window as any).__introText = "";
      (window as any).__expandedText = "";

      const upgradeBox = $("upgradeBox");
      if (upgradeBox) upgradeBox.style.display = "none";

      ["expandBtn", "regenExpandedBtn", "genIntroBtn", "genTitlesBtn"].forEach((id) => {
        const b = $(id);
        if (b) b.disabled = false;
      });

      try {
        const resp = await fetch("/api/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, audience, blocker, chapters, voiceSample, voiceNotes }),
        });

        const data = await safeJson(resp);
        if (!resp.ok) throw new Error(data?.error || "Request failed");

        (window as any).__projectId = data.projectId || data.project_id || null;

        const title = data.title || "Untitled";
        const purpose = data.purpose || "";
        const outline = Array.isArray(data.outline) ? data.outline : [];

        (window as any).__outlineItems = outline;
        (window as any).__title = title;
        (window as any).__purpose = purpose;

        try {
          localStorage.setItem(
            "authored_last_start",
            JSON.stringify({
              savedAt: new Date().toISOString(),
              title,
              purpose,
              outline,
              topic,
              audience,
              blocker,
              chapters,
              voiceSample,
              voiceNotes,
            })
          );
        } catch {}

        $("titleOut").textContent = title;
        $("purposeOut").textContent = purpose;

        const list = $("outlineOut");
        list.innerHTML = "";
        outline.forEach((item: any, idx: number) => {
          const li = document.createElement("li");
          li.textContent = item?.title || `Chapter ${idx + 1}`;
          list.appendChild(li);
        });

        const picker = $("chapterPick");
        picker.innerHTML = "";
        outline.forEach((item: any, idx: number) => {
          const opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = `Chapter ${idx + 1}: ${item?.title || `Chapter ${idx + 1}`}`;
          picker.appendChild(opt);
        });

        $("result").scrollIntoView({ behavior: "smooth" });
      } catch {
        $("titleOut").textContent = "Could not generate outline";
        $("purposeOut").textContent = "Something went wrong. Please try again.";
        $("outlineOut").innerHTML = "<li>Error generating outline.</li>";
      }
    }

    (window as any).__runOutlineGeneration = runOutlineGeneration;

    // ===== Button wiring (THIS is what fixes non-clicking) =====
    $("beginBtn")?.addEventListener("click", () => {
      const topic = clean($("topic")?.value);
      const audience = clean($("audience")?.value);
      const blocker = clean($("blocker")?.value);
      const genre = getSelectedGenreLabel();

      const reflection = buildReflectionText({ topic, audience, blocker, genre });

      const result = $("result");
      if (result) result.style.display = "none";

      showReflectionGate(reflection);
    });

    $("reflectionContinue")?.addEventListener("click", async () => {
      hideReflectionGate();
      await runOutlineGeneration();
    });

    $("reflectionAdjust")?.addEventListener("click", () => {
      hideReflectionGate();
      const topicEl = $("topic");
      if (topicEl) {
        topicEl.scrollIntoView({ behavior: "smooth", block: "center" });
        topicEl.focus();
      }
    });

    // ===== Copy / Download / Regen outline =====
    const safeTitleForFilename = (t: string) =>
      (t || "authored")
        .toString()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 40) || "authored";

    const makeTextBundle = () => {
      const title = clean($("titleOut")?.textContent || "");
      const purpose = clean($("purposeOut")?.textContent || "");
      const outlineItems = (window as any).__outlineItems || [];
      const outlineText = outlineItems
        .map((x: any, i: number) => `${i + 1}. ${x?.title ? x.title : `Chapter ${i + 1}`}`)
        .join("\n");
      return `Title: ${title}\n\nPurpose:\n${purpose}\n\nOutline:\n${outlineText}\n`;
    };

    const copyText = async (text: string) => {
      await navigator.clipboard.writeText(text);
      alert("Copied.");
    };

    const downloadText = (filename: string, text: string) => {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    $("copyBtn")?.addEventListener("click", async () => {
      try {
        await copyText(makeTextBundle());
      } catch {
        alert("Copy failed. Try again.");
      }
    });

    $("downloadBtn")?.addEventListener("click", () => {
      const title = clean($("titleOut")?.textContent || "");
      const safe = safeTitleForFilename(title);
      downloadText(`${safe}_outline.txt`, makeTextBundle());
    });

    $("regenOutlineBtn")?.addEventListener("click", () => {
      const last = (window as any).__lastOutlinePayload;
      if (!last) {
        alert("Generate an outline first.");
        return;
      }
      $("topic").value = last.topic || "";
      $("audience").value = last.audience || "";
      $("blocker").value = last.blocker || "";
      $("chapters").value = String(last.chapters || 12);
      $("voiceSample").value = last.voiceSample || "";
      $("voiceNotes").value = last.voiceNotes || "";

      (window as any).__runOutlineGeneration?.();
    });

    // ===== Titles =====
    $("genTitlesBtn")?.addEventListener("click", async () => {
      const out = $("titleIdeasOut");
      if (!out) return;
      out.innerHTML = "<li>Generating title ideas...</li>";

      try {
        // ✅ FIX: Build headers as a typed string map (prevents TS overload mismatch)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        };

        const resp = await fetch("/api/titles", {
          method: "POST",
          headers,
          body: JSON.stringify({
            topic: clean($("topic")?.value),
            audience: clean($("audience")?.value),
            blocker: clean($("blocker")?.value),
            currentTitle: (window as any).__title || clean($("titleOut")?.textContent),
            voiceSample: clean($("voiceSample")?.value),
            voiceNotes: clean($("voiceNotes")?.value),
          }),
        });

        const data = await safeJson(resp);

        if (data?.error === "project_locked") {
          out.innerHTML = "";
          showUpgrade(
            "This project is locked after your first expansion on the Project plan. Upgrade to Lifetime to start a new book."
          );
          return;
        }

        if (isLimitReachedError(data)) {
          out.innerHTML = "";
          showUpgrade("You’ve reached the free plan limit for title suggestions.");
          return;
        }

        if (!resp.ok) throw new Error(data?.error || "Titles failed");

        const titles = Array.isArray(data.titles) ? data.titles : [];
        if (!titles.length) throw new Error("no_titles");

        out.innerHTML = "";
        titles.slice(0, 10).forEach((t: any) => {
          const li = document.createElement("li");
          li.style.marginBottom = "6px";

          const useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "btn secondary";
          useBtn.textContent = "Use";
          (useBtn.style as any).marginRight = "10px";
          useBtn.addEventListener("click", () => {
            (window as any).__title = String(t);
            $("titleOut").textContent = String(t);
            alert("Title updated.");
          });

          const span = document.createElement("span");
          span.textContent = String(t);

          li.appendChild(useBtn);
          li.appendChild(span);
          out.appendChild(li);
        });
      } catch {
        out.innerHTML = "";
        alert("Could not generate titles. Try again.");
      }
    });

    // ===== Intro =====
    $("genIntroBtn")?.addEventListener("click", async () => {
      const introOut = $("introOut");
      if (introOut) introOut.textContent = "Generating introduction...";

      try {
        // ✅ FIX: Build headers as a typed string map (prevents TS overload mismatch)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        };

        const resp = await fetch("/api/intro", {
          method: "POST",
          headers,
          body: JSON.stringify({
            // ✅ intro endpoint expects these fields
            bookTitle: (window as any).__title || clean($("titleOut")?.textContent),
            purpose: (window as any).__purpose || clean($("purposeOut")?.textContent),
            outline: (window as any).__outlineItems || [],
            voiceSample: clean($("voiceSample")?.value),
            voiceNotes: clean($("voiceNotes")?.value),
          }),
        });

        const data = await safeJson(resp);

        if (data?.error === "project_locked") {
          if (introOut) introOut.textContent = "Project locked.";
          showUpgrade(
            "This project is locked after your first expansion on the Project plan. Upgrade to Lifetime to start a new book."
          );
          return;
        }

        if (isLimitReachedError(data)) {
          if (introOut) introOut.textContent = "Free plan limit reached.";
          showUpgrade("You’ve reached the free plan limit for introductions.");
          return;
        }

        if (resp.status === 401) {
          if (introOut) introOut.textContent = "Please log in to generate an introduction.";
          showUpgrade("Please log in to generate introductions.");
          return;
        }

        if (!resp.ok) throw new Error(data?.error || "Intro failed");

        const intro = (data.introduction || "").toString().trim();
        if (!intro) throw new Error("no_intro");

        (window as any).__introText = intro;
        if (introOut) introOut.textContent = intro;
        $("copyIntroBtn").disabled = false;
        $("downloadIntroBtn").disabled = false;
      } catch {
        if ($("introOut"))
          $("introOut").textContent =
            'Click “Generate introduction” to create an optional intro.';
        alert("Could not generate introduction. Try again.");
      }
    });

    $("copyIntroBtn")?.addEventListener("click", async () => {
      try {
        await copyText((window as any).__introText || "");
      } catch {
        alert("Copy failed. Try again.");
      }
    });

    $("downloadIntroBtn")?.addEventListener("click", () => {
      const safe = safeTitleForFilename((window as any).__title || "authored");
      downloadText(`${safe}_introduction.txt`, (window as any).__introText || "");
    });

    // ===== Expand =====
    const getDraftWordRange = () => {
      const v = (clean($("draftLength")?.value) || "standard").toLowerCase();
      if (v === "long") return { draftLength: "long", minWords: 1500, maxWords: 2200 };
      if (v === "very_long")
        return { draftLength: "very_long", minWords: 2500, maxWords: 3500 };
      return { draftLength: "standard", minWords: 900, maxWords: 1300 };
    };

    const runExpandRequest = async (mode: "expand" | "regen") => {
      const outline = (window as any).__outlineItems || [];
      if (!outline.length) {
        alert("Generate your starting point first.");
        return;
      }

      const picker = $("chapterPick") as HTMLSelectElement | null;
      const chapterIdx = Number(picker?.value || 0);
      const chapterObj = outline[chapterIdx];
      if (!chapterObj) {
        alert("Pick a chapter first.");
        return;
      }

      const { draftLength, minWords, maxWords } = getDraftWordRange();
      const expandedOut = $("expandedOut");
      if (expandedOut)
        expandedOut.textContent = mode === "regen" ? "Regenerating..." : "Expanding...";

      // ✅ FIX: Build headers as a typed string map (prevents TS overload mismatch)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      };

      const resp = await fetch("/api/expand", {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId: (window as any).__projectId,
          bookTitle: (window as any).__title || clean($("titleOut")?.textContent) || "Untitled",
          purpose: (window as any).__purpose || clean($("purposeOut")?.textContent) || "",
          chapterNumber: chapterIdx + 1,
          chapterTitle: chapterObj.title,
          audience: clean($("audience")?.value),
          topic: clean($("topic")?.value),
          blocker: clean($("blocker")?.value),
          voiceSample: clean($("voiceSample")?.value),
          voiceNotes: clean($("voiceNotes")?.value),
          regenerate: mode === "regen",
          draftLength,
          minWords,
          maxWords,
        }),
      });

      const data = await safeJson(resp);

      if (resp.status === 401) {
        if (expandedOut) expandedOut.textContent = "Please log in to expand chapters.";
        showUpgrade("Please log in or upgrade to expand chapters. Outline creation is free.");
        return;
      }

      if (data?.error === "project_locked") {
        if (expandedOut) expandedOut.textContent = "Project locked.";
        showUpgrade(
          "This project is locked after your first expansion on the Project plan. Upgrade to Lifetime to start a new book."
        );
        return;
      }

      if (isLimitReachedError(data)) {
        if (expandedOut) expandedOut.textContent = "Free plan limit reached.";
        showUpgrade(
          "You’ve reached the free plan limit for chapter expansion. Upgrade to expand more chapters. Regenerate counts too."
        );
        return;
      }

      if (!resp.ok) {
        if (expandedOut) expandedOut.textContent = "Could not expand this chapter. Please try again.";
        return;
      }

      const expanded = (data.expanded || "").toString().trim();
      if (!expanded) {
        if (expandedOut) expandedOut.textContent = "No expanded text returned. Please try again.";
        return;
      }

      (window as any).__expandedText = expanded;
      if (expandedOut) expandedOut.textContent = expanded;

      $("copyExpandedBtn").disabled = false;
      $("downloadExpandedBtn").disabled = false;
      $("regenExpandedBtn").disabled = false;
    };

    $("expandBtn")?.addEventListener("click", () => runExpandRequest("expand"));
    $("regenExpandedBtn")?.addEventListener("click", () => runExpandRequest("regen"));

    $("copyExpandedBtn")?.addEventListener("click", async () => {
      try {
        await copyText((window as any).__expandedText || "");
      } catch {
        alert("Copy failed. Try again.");
      }
    });

    $("downloadExpandedBtn")?.addEventListener("click", () => {
      const safe = safeTitleForFilename((window as any).__title || "authored");
      downloadText(`${safe}_expanded_chapter.txt`, (window as any).__expandedText || "");
    });

    // ===== Genre quick-fill (same behavior) =====
    (function initGenreButtons() {
      const buttons = document.querySelectorAll(".genre-btn") as NodeListOf<HTMLButtonElement>;
      const topicEl = $("topic") as HTMLTextAreaElement | null;
      if (!buttons.length || !topicEl) return;

      const presets: Record<string, string> = {
        memoir: "I want to write a memoir about ",
        devotional: "I want to write a devotional focused on ",
        nonfiction: "I want to write a practical non-fiction book that helps people ",
        fiction: "I want to write a fiction story about ",
        inspirational: "I want to write an inspirational book that encourages readers to ",
      };

      const setActive = (btn: HTMLButtonElement) => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      };

      buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-genre") || "";
          const text = presets[key] || "";

          setActive(btn);

          const current = (topicEl.value || "").trim();
          if (!current) {
            topicEl.value = text;
          } else {
            const tag = `Genre: ${clean(btn.textContent)}.`;
            if (!current.toLowerCase().includes("genre:")) {
              topicEl.value = current + "\n\n" + tag;
            }
          }

          topicEl.focus();
          topicEl.setSelectionRange(topicEl.value.length, topicEl.value.length);
        });
      });
    })();
  }, []);

  return (
    <>
      {/* Keep your original external dependencies */}
      <Script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" strategy="beforeInteractive" />
      <Script src="/account.js" strategy="beforeInteractive" />
      <Script src="/auth-guard.js" strategy="beforeInteractive" />

      <style>{`
        body { font-family: Arial, sans-serif; margin: 48px; max-width: 900px; }
        h1 { margin: 0 0 8px; }
        p { color:#333; line-height:1.5; }
        label { display:block; font-weight:700; margin-top:14px; }
        input[type="text"], textarea, select {
          width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:14px;
        }
        textarea { min-height:80px; }
        .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-top:12px; }
        .btn {
          padding:10px 14px; border:1px solid #111; background:#111; color:#fff;
          border-radius:8px; cursor:pointer; font-weight:700;
          text-decoration:none; display:inline-block;
        }
        .btn.secondary { background:#fff; color:#111; }
        .btn:disabled { opacity:0.5; cursor:not-allowed; }
        .muted { color:#666; font-size:13px; }
        hr { margin:18px 0; border:none; border-top:1px solid #eee; }

        .notice {
          background:#fff7d6;
          border:1px solid #f2d27a;
          padding:12px 14px;
          border-radius:10px;
          margin:14px 0 18px;
          color:#5a4600;
        }

        #result { display:none; margin-top:18px; }
        .card {
          border:1px solid #e6e6e6;
          border-radius:12px;
          padding:16px;
          background:#fff;
        }
        .pill {
          display:inline-block;
          padding:4px 10px;
          border-radius:999px;
          border:1px solid #ddd;
          font-size:12px;
          color:#333;
          margin-right:8px;
          margin-bottom:6px;
        }
        ol { padding-left:18px; }
        ul { padding-left:18px; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
        .two-col { display:flex; gap:16px; flex-wrap:wrap; }
        .two-col > div { flex:1 1 320px; }
        pre {
          white-space: pre-wrap;
          background:#fafafa;
          border:1px solid #eee;
          padding:12px;
          border-radius:10px;
          font-size:13px;
          line-height:1.45;
        }

        .upgrade-box {
          display:none;
          border:1px solid #e6e6e6;
          border-radius:12px;
          padding:14px;
          background:#fff;
          margin-top:12px;
        }
        .upgrade-box h3 { margin:0 0 6px; }
        .upgrade-grid { display:flex; gap:12px; flex-wrap:wrap; margin-top:10px; }
        .plan {
          flex:1 1 260px;
          border:1px solid #eee;
          border-radius:12px;
          padding:12px;
          background:#fafafa;
        }
        .plan h4 { margin:0 0 6px; }
        .plan ul { margin:8px 0 0 18px; }
        .plan li { margin:6px 0; }

        .quickstart { margin: 8px 0 10px; }
        .quickstart-note { font-size: 13px; color: #444; margin-bottom: 8px; }
        .quickstart-sub { font-size: 12px; color: #666; margin-top: 8px; }

        .genre-row { display:flex; gap:10px; flex-wrap:wrap; }
        .genre-btn{
          appearance:none;
          border: 1px solid #cfcfcf;
          background: #fff;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          cursor: pointer;
        }
        .genre-btn:hover{ background:#f6f6f6; }
        .genre-btn.active{
          border-color:#111;
          background:#111;
          color:#fff;
        }

        html, body { min-height: 100%; }

        html::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: -3;
          background: url("/assets/hero-start.webp") center/cover no-repeat;
          transform: scale(1.03);
          opacity: 0.16;
          filter: saturate(1.02) contrast(1.02);
        }

        html::after{
          content:"";
          position: fixed;
          inset: 0;
          z-index: -2;
          background:
            url("/assets/paper-texture.webp") center/cover repeat,
            radial-gradient(1200px 800px at 20% 15%, rgba(0,0,0,.06), rgba(0,0,0,.20) 70%),
            linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.18));
          opacity: 0.22;
          pointer-events: none;
        }

        body{
          background: rgba(255,255,255,.95);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 22px 70px rgba(0,0,0,.40);
          backdrop-filter: blur(6px);
        }

        #emptyState{ margin: 14px 0 18px; }
        #emptyState img{
          width: 100%;
          max-width: 820px;
          display: block;
          border-radius: 16px;
          border: 1px solid #e6e6e6;
          box-shadow: 0 18px 60px rgba(0,0,0,.18);
        }
        #emptyState .muted{ margin-top: 10px; }

        @media (max-width: 640px){
          body{
            margin: 24px 20px;
            padding: 18px;
            border-radius: 16px;
          }
          html::before{ opacity: 0.14; }
          html::after{ opacity: 0.26; }

          .actions{ gap:8px; }
          .btn{ width:100%; text-align:center; }
          .row > div[style*="display:flex"]{ width:100%; }
          #emptyState img{ border-radius: 14px; }
        }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center" }}>
          <img src="/assets/logo-authored.png" alt="Authored" style={{ height: 40, width: "auto" }} />
        </a>
      </div>

      <h1>Start your book</h1>
      <p className="muted">
        Authored is not writing for you. It is writing with you. You bring the message. Authored helps you shape it.
      </p>

      <div className="notice" id="freeNotice">
        <strong>Free version:</strong> Outline generation is free. <span id="freeLimitText"></span>
        <br />
        <span className="muted">Full chapter drafts (Expand) are limited in the free version.</span>
      </div>

      <div id="emptyState">
        <img src="/assets/empty-state.webp" alt="Start your draft" loading="lazy" />
        <p className="muted">
          Tip: start with a simple idea. Authored will help you shape it into a clear outline you can expand.
        </p>
      </div>

      <div className="upgrade-box" id="upgradeBox">
        <h3>Limit reached</h3>
        <p className="muted" id="upgradeMsg" style={{ margin: "6px 0 0" }}>
          You’ve reached the free plan limit for this feature.
        </p>

        <div className="upgrade-grid">
          <div className="plan">
            <h4>Project plan ($49)</h4>
            <div className="muted">One project, one user</div>
            <ul>
              <li>Expand chapters</li>
              <li>Regenerate drafts</li>
              <li>DOCX export</li>
              <li>Voice + tone controls</li>
            </ul>
            <div className="actions">
              <a className="btn" href="/pricing" id="upgradeProjectBtn">
                Upgrade
              </a>
              <a className="btn secondary" href="/start">
                Keep writing
              </a>
            </div>
          </div>

          <div className="plan">
            <h4>Lifetime ($149)</h4>
            <div className="muted">All features, one user</div>
            <ul>
              <li>Unlimited projects</li>
              <li>More expansions</li>
              <li>Priority features as Authored grows</li>
            </ul>
            <div className="actions">
              <a className="btn" href="/pricing" id="upgradeLifetimeBtn">
                Upgrade
              </a>
              <a className="btn secondary" href="/start">
                Keep writing
              </a>
            </div>
          </div>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          For now, these buttons go to a placeholder page. We’ll wire payment later.
        </p>
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

      <textarea id="topic" placeholder="It’s okay if you’re not sure yet."></textarea>

      <label>Who is this for?</label>
      <input id="audience" type="text" placeholder="Who do you want to reach?" />

      <label>What’s been stopping you from writing?</label>
      <input id="blocker" type="text" placeholder="Fear, time, clarity, confidence..." />

      <hr />

      <h3 style={{ margin: "0 0 8px" }}>Your voice</h3>
      <p className="muted" style={{ margin: "0 0 10px" }}>
        If you want Authored to sound like you, paste a short sample of your writing below. A page is enough. The better
        the sample, the better the voice match.
      </p>

      <label>Your writing sample (optional but recommended)</label>
      <textarea
        id="voiceSample"
        placeholder="Paste something you wrote: a sermon excerpt, a blog post, a letter, a chapter draft, anything that sounds like you."
      ></textarea>

      <label>Voice notes (optional)</label>
      <input
        id="voiceNotes"
        type="text"
        placeholder="Example: warm, pastoral, simple, no fluff, avoid robotic tone, use my natural phrases."
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
          <div className="muted" id="limitNote">
            Free plan: Titles/intro/expansions are limited. Regenerate counts too.
          </div>
          <div id="limitError" style={{ margin: "6px 0", color: "#b00020", fontSize: 14 }}></div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <button className="btn" id="beginBtn" type="button">
            Let’s shape a starting point
          </button>
          <a href="/" style={{ alignSelf: "center" }}>
            Back to home
          </a>
        </div>
      </div>

      <div id="reflectionGate" className="card" style={{ display: "none", marginTop: 16 }}>
        <h3 style={{ margin: "0 0 6px" }}>Let’s make sure I understand</h3>
        <p id="reflectionText" style={{ margin: "0 0 10px", lineHeight: 1.55 }}></p>
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
          <strong>Done.</strong> You have a starting point you can refine.
        </p>

        <div className="card">
          <div>
            <span className="pill">Working title</span>
            <span className="pill">Starter outline</span>
            <span className="pill">Writing with you</span>
          </div>

          <h3 style={{ margin: "14px 0 6px" }}>One-sentence purpose</h3>
          <p id="purposeOut">Please wait...</p>
          <div className="muted" style={{ marginTop: -6 }}>
            Does this reflect what you want to say?
          </div>

          <h2 id="titleOut" style={{ margin: "14px 0 6px" }}>
            Generating...
          </h2>

          <div className="actions" style={{ marginTop: 6 }}>
            <button className="btn secondary" id="genTitlesBtn" type="button">
              Explore title ideas
            </button>
            <span className="muted" id="titlesHint">
              10 options you can pick from.
            </span>
          </div>
          <ul id="titleIdeasOut" className="muted" style={{ marginTop: 8 }}></ul>

          <h3 style={{ margin: "14px 0 6px" }}>Outline</h3>
          <div className="muted" style={{ margin: "-4px 0 8px" }}>
            Here’s one possible way to structure this.
          </div>
          <ol id="outlineOut">
            <li>Creating your outline...</li>
          </ol>

          <div className="actions">
            <button className="btn secondary" id="copyBtn" type="button">
              Copy to clipboard
            </button>
            <button className="btn secondary" id="downloadBtn" type="button">
              Download (.txt)
            </button>
            <button className="btn secondary" id="regenOutlineBtn" type="button">
              Regenerate outline
            </button>
          </div>

          <hr />
          <h3 style={{ margin: "0 0 8px" }}>Introduction</h3>
          <div className="actions">
            <button className="btn secondary" id="genIntroBtn" type="button">
              Draft an opening together
            </button>
            <span className="muted" id="introHint">
              Optional: 400–700 words that sets the tone.
            </span>
          </div>
          <pre id="introOut">Click “Generate introduction” to create an optional intro.</pre>
          <div className="actions">
            <button className="btn secondary" id="copyIntroBtn" type="button" disabled>
              Copy introduction
            </button>
            <button className="btn secondary" id="downloadIntroBtn" type="button" disabled>
              Download intro (.txt)
            </button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 10px" }}>Expand a chapter</h3>

          <div className="row" style={{ marginTop: 0 }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label style={{ marginTop: 0 }}>Draft length</label>
              <select id="draftLength" defaultValue="standard">
                <option value="standard">Standard (900–1300 words)</option>
                <option value="long">Long (1500–2200 words)</option>
                <option value="very_long">Very long (2500–3500 words)</option>
              </select>
              <div className="muted" id="draftLengthHint">
                Longer drafts cost more.
              </div>
            </div>
          </div>

          <div className="two-col">
            <div>
              <label style={{ marginTop: 0 }}>Choose chapter</label>
              <select id="chapterPick"></select>
              <div className="muted" id="expandHint"></div>

              <div className="actions" style={{ marginTop: 10 }}>
                <button className="btn" id="expandBtn" type="button">
                  Work through this chapter
                </button>
                <button className="btn secondary" id="copyExpandedBtn" type="button" disabled>
                  Copy expanded text
                </button>
                <button className="btn secondary" id="downloadExpandedBtn" type="button" disabled>
                  Download expanded (.txt)
                </button>
                <button className="btn secondary" id="regenExpandedBtn" type="button" disabled>
                  Try another version
                </button>
              </div>

              <div className="notice" style={{ marginTop: 12 }}>
                <strong>Heads up:</strong> Expanding chapters costs more than generating an outline. In the free version,
                expansion is limited. Regenerate counts toward the same limit.
              </div>
            </div>

            <div>
              <label style={{ marginTop: 0 }}>Expanded draft</label>
              <pre id="expandedOut">Choose a chapter and click Expand.</pre>
            </div>
          </div>
        </div>
      </div>

      <hr />

      <div
        style={{
          textAlign: "center",
          margin: "24px 0",
          display: "flex",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <a
          href="mailto:support@myauthored.com?subject=Authored%20Support"
          className="btn secondary"
          style={{ fontSize: 13, padding: "8px 14px" }}
        >
          Help / Support
        </a>

        <a
          href="https://www.improvedsolution.com/quote"
          target="_blank"
          rel="noopener"
          className="btn secondary"
          style={{ fontSize: 13, padding: "8px 14px" }}
        >
          Publishing assistance
        </a>
      </div>
    </>
  );
}