// app/api/titles/route.ts
// Titles suggestions (legacy /api/titles.js behavior), App Router route handler
// Limits enforced via public.usage_limits

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FREE_LIMITS = { titles_total: 1 };
const PROJECT_LIMITS = { titles_total: 10 };

function clean(v: any) {
  return (v ?? "").toString().trim();
}

/**
 * Supports:
 * - Authorization: Bearer <access_token>
 * - Cookie: sb-access-token=<access_token>  (your legacy cookie written by account.js)
 * - Cookie: sb-<projectRef>-auth-token=...  (Supabase v2 default; JSON payload)
 */
function extractAccessToken(headers: Headers) {
  const auth = headers.get("authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  const cookie = headers.get("cookie") || "";

  // 1) Your legacy cookie (what your API expects today)
  const sbAccess = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  if (sbAccess?.[1]) {
    try {
      return decodeURIComponent(sbAccess[1]);
    } catch {
      return sbAccess[1];
    }
  }

  // 2) Supabase v2 default cookie: sb-<ref>-auth-token=<urlencoded json>
  // Shape usually includes access_token inside the JSON.
  const sbV2 = cookie.match(/(?:^|;\s*)sb-[a-z0-9]+-auth-token=([^;]+)/i);
  if (sbV2?.[1]) {
    let raw = sbV2[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // ignore
    }

    try {
      const parsed = JSON.parse(raw);

      // Supabase sometimes stores an array: [session, refresh] or similar
      if (Array.isArray(parsed)) {
        const maybeSession = parsed[0];
        const token =
          maybeSession?.access_token ||
          maybeSession?.currentSession?.access_token ||
          maybeSession?.data?.session?.access_token;
        if (token) return String(token).trim();
      }

      // Or an object
      const token =
        parsed?.access_token ||
        parsed?.currentSession?.access_token ||
        parsed?.data?.session?.access_token;
      if (token) return String(token).trim();
    } catch {
      // ignore
    }
  }

  return null;
}

async function getUserIdFromRequest(supabaseAdmin: any, req: Request) {
  const token = extractAccessToken(req.headers);
  if (!token) return null;
  const u = await supabaseAdmin.auth.getUser(token);
  return u?.data?.user?.id || null;
}

async function consumeTitles({
  supabaseAdmin,
  userId,
}: {
  supabaseAdmin: any;
  userId: string;
}) {
  const existing = await supabaseAdmin
    .from("usage_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) return { allowed: false, hardError: existing.error.message };

  const row = existing.data;
  const plan = (row?.plan || "free").toString().toLowerCase();

  if (plan === "lifetime") return { allowed: true };

  const used = Number(row?.titles_used || 0);
  const cap =
    plan === "project"
      ? Number(row?.project_titles_cap || PROJECT_LIMITS.titles_total)
      : FREE_LIMITS.titles_total;

  if (used >= cap) return { allowed: false, limitReached: true };

  const up = await supabaseAdmin
    .from("usage_limits")
    .upsert(
      {
        user_id: userId,
        plan: row?.plan || "free",
        project_titles_cap:
          row?.project_titles_cap ??
          (plan === "project" ? PROJECT_LIMITS.titles_total : null),
        titles_used: used + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (up.error) return { allowed: false, hardError: up.error.message };
  return { allowed: true };
}

export async function POST(req: Request) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // (Optional but useful while debugging locally)
    console.log("TITLES ENV", {
      OPENAI_API_KEY: !!OPENAI_API_KEY,
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
    });

    if (!OPENAI_API_KEY)
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    if (!SUPABASE_URL)
      return NextResponse.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const token = extractAccessToken(req.headers);
    console.log("TITLES AUTH", {
      hasAuthHeader: !!req.headers.get("authorization"),
      hasCookieHeader: !!req.headers.get("cookie"),
      hasToken: !!token,
    });

    const userId = await getUserIdFromRequest(supabaseAdmin, req);
    if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as any;

    const topic = clean(body.topic);
    const audience = clean(body.audience);
    const blocker = clean(body.blocker);
    const currentTitle = clean(body.currentTitle);
    const voiceSample = clean(body.voiceSample);
    const voiceNotes = clean(body.voiceNotes);

    const lim = await consumeTitles({ supabaseAdmin, userId });
    if (!lim.allowed) {
      if ((lim as any).limitReached) {
        // legacy behavior: 200 + { error: "limit_reached" }
        return NextResponse.json({ error: "limit_reached" }, { status: 200 });
      }
      return NextResponse.json(
        { error: "limit_check_failed", details: (lim as any).hardError || "unknown" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = `
You generate book title suggestions.
Return only JSON, no extra text.
Titles must be punchy, clear, and not generic.
Avoid clickbait. Avoid overly long titles.
No AI references.
`.trim();

    const idea = topic || currentTitle || "A helpful book idea";

    const user = {
      task: "Generate 10 title suggestions",
      idea,
      audience,
      blocker,
      currentTitle,
      voiceNotes,
      voiceSample_snippet: voiceSample ? voiceSample.slice(0, 1800) : "",
      output_schema: { titles: ["string"] },
    };

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}

    const titles = Array.isArray(parsed.titles)
      ? parsed.titles.map((t: any) => clean(t)).filter(Boolean).slice(0, 10)
      : [];

    if (!titles.length)
      return NextResponse.json({ error: "no_titles_returned" }, { status: 500 });

    return NextResponse.json({ titles }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// Keep legacy behavior: non-POST => 405 JSON
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}