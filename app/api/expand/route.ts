// app/api/expand/route.ts
// Migrated from legacy /api/expand.js to Next.js App Router.
// Preserves: limits logic, project lock hash, auth extraction, response shapes.

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FREE_LIMITS = { expands_per_day: 2 };
const PROJECT_LIMITS = { expands_total: 40 };

function clean(v: unknown) {
  return (v ?? "").toString().trim();
}

function normalizeForLock(v: unknown) {
  return clean(v).toLowerCase().replace(/\s+/g, " ").slice(0, 2000);
}

function lockHashFromBody(body: any) {
  const topic = normalizeForLock(body?.topic);
  const audience = normalizeForLock(body?.audience);
  const blocker = normalizeForLock(body?.blocker);
  const base = `topic:${topic}|aud:${audience}|blocker:${blocker}`;
  return crypto.createHash("sha256").update(base).digest("hex");
}

function extractAccessToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  const cookie = req.headers.get("cookie") || "";
  const sbAccess = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  if (sbAccess?.[1]) return decodeURIComponent(sbAccess[1]);

  return null;
}

async function getUserIdFromRequest(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const token = extractAccessToken(req);
  if (!token) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

function todayISODateUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

async function consumeExpand({
  supabase,
  userId,
  body
}: {
  supabase: any;
  userId: string;
  body: any;
}) {
  const today = todayISODateUTC();

  const existing = await supabase
    .from("usage_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) return { allowed: false, hardError: existing.error.message };

  const row = existing.data;
  const plan = (row?.plan || "free").toString().toLowerCase();

  // Lifetime: no caps
  if (plan === "lifetime") {
    const nextTotal = Number(row?.expands_used || 0) + 1;
    const up = await supabase
      .from("usage_limits")
      .upsert(
        {
          user_id: userId,
          plan: row?.plan || "lifetime",
          expands_used: nextTotal,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
    if (up.error) return { allowed: false, hardError: up.error.message };
    return { allowed: true };
  }

  // Project: total cap + lock on first expand
  if (plan === "project") {
    const cap = Number(row?.project_expands_cap || PROJECT_LIMITS.expands_total);
    const used = Number(row?.expands_used || 0);

    if (used >= cap) return { allowed: false, limitReached: true };

    const incomingLock = lockHashFromBody(body);
    const currentLock = clean(row?.project_lock_hash);

    if (currentLock && currentLock !== incomingLock) {
      return { allowed: false, projectLocked: true };
    }

    const nextTotal = used + 1;
    const up = await supabase
      .from("usage_limits")
      .upsert(
        {
          user_id: userId,
          plan: row?.plan || "project",
          project_lock_hash: currentLock || incomingLock,
          project_expands_cap: row?.project_expands_cap ?? PROJECT_LIMITS.expands_total,
          expands_used: nextTotal,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );

    if (up.error) return { allowed: false, hardError: up.error.message };
    return { allowed: true };
  }

  // Free: daily cap
  const rowDay = row?.expands_day ? String(row.expands_day).slice(0, 10) : null;
  const usedToday = Number(row?.expands_used_today || 0);
  const effectiveUsed = rowDay === today ? usedToday : 0;

  if (effectiveUsed >= FREE_LIMITS.expands_per_day) {
    return { allowed: false, limitReachedToday: true };
  }

  const nextUsedToday = effectiveUsed + 1;
  const nextTotal = Number(row?.expands_used || 0) + 1;

  const up = await supabase
    .from("usage_limits")
    .upsert(
      {
        user_id: userId,
        plan: row?.plan || "free",
        expands_day: today,
        expands_used_today: nextUsedToday,
        expands_used: nextTotal,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (up.error) return { allowed: false, hardError: up.error.message };
  return { allowed: true };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    if (!SUPABASE_URL) return Response.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    if (!SUPABASE_ANON_KEY) return Response.json({ error: "Missing SUPABASE_ANON_KEY" }, { status: 500 });

    // This replaces legacy supabaseAdmin() import
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const body = (await req.json().catch(() => ({}))) as any;

    const authedUserId = await getUserIdFromRequest(req);
    if (!authedUserId) return Response.json({ error: "not_authenticated" }, { status: 401 });

    const {
      topic,
      audience,
      blocker,
      bookTitle,
      purpose,
      chapterTitle,
      chapterNumber,
      voiceSample,
      voiceNotes,
      minWords = 900,
      maxWords = 1300
    } = body;

    if (!clean(chapterTitle) || !clean(topic)) {
      return Response.json({ error: "Missing chapterTitle or topic" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const lim = await consumeExpand({ supabase, userId: authedUserId, body });
    if (!lim.allowed) {
      if ((lim as any).projectLocked) return Response.json({ error: "project_locked" }, { status: 200 });
      if ((lim as any).limitReachedToday) return Response.json({ error: "limit_reached_today" }, { status: 200 });
      if ((lim as any).limitReached) return Response.json({ error: "limit_reached" }, { status: 200 });
      return Response.json(
        { error: "limit_check_failed", details: (lim as any).hardError || "unknown" },
        { status: 500 }
      );
    }

    const voiceBlock = clean(voiceSample)
      ? `VOICE SAMPLE (match style strictly):\n${clean(voiceSample)}\n\nVOICE NOTES:\n${clean(voiceNotes) || "none"}`
      : `VOICE NOTES:\n${clean(voiceNotes) || "none"} (Keep voice human.)`;

    const prompt = `
Write a chapter draft.

Book: ${clean(bookTitle)}
Purpose: ${clean(purpose)}
Chapter ${Number(chapterNumber) || 1}: ${clean(chapterTitle)}
Audience: ${clean(audience)}
Topic context: ${clean(topic)}
Blocker: ${clean(blocker)}

${voiceBlock}

Rules:
- Human voice only
- No AI mentions
- ${Number(minWords) || 900}–${Number(maxWords) || 1300} words
- Headings + flow
- End with 5 reflection questions

Return JSON only:
{ "expanded": "..." }
`.trim();

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "You are a strict writing coach." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const expanded = typeof parsed.expanded === "string" ? clean(parsed.expanded) : "";
    if (!expanded) return Response.json({ error: "no_expanded_text_returned" }, { status: 500 });

    return Response.json({ expanded }, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { error: "Expand failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// Preserve legacy 405 style for non-POST
export async function GET() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}