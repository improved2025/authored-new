// app/api/intro/route.ts

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env() {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  };
}

const FREE_LIMITS = { intros_total: 1 };
const PROJECT_LIMITS = { intros_total: 5 };

// Guest cookie name (server-set)
const GUEST_COOKIE = "authored_guest_usage_v1";

function clean(v: unknown) {
  return (v ?? "").toString().trim();
}

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function setCookieHeader(name: string, value: string) {
  // Lax cookie so it works on localhost + Vercel, and survives navigation
  // Not HttpOnly because we don’t need to hide it; it’s just a limiter.
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readGuestUsage(req: Request) {
  const raw = getCookie(req, GUEST_COOKIE);
  if (!raw) return { introductions_used: 0 };
  try {
    const parsed = JSON.parse(raw);
    return {
      introductions_used: Number(parsed?.introductions_used || 0)
    };
  } catch {
    return { introductions_used: 0 };
  }
}

function writeGuestUsageHeaders(next: { introductions_used: number }) {
  return {
    "Set-Cookie": setCookieHeader(GUEST_COOKIE, JSON.stringify(next))
  };
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

async function getUserIdFromRequest(supabaseAdmin: any, req: Request) {
  const token = extractAccessToken(req);
  if (!token) return null;
  const u = await supabaseAdmin.auth.getUser(token);
  return u?.data?.user?.id || null;
}

async function consumeIntroSupabase({
  supabaseAdmin,
  userId
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

  const used = Number(row?.introductions_used || 0);

  const cap =
    plan === "project"
      ? Number(row?.project_intros_cap || PROJECT_LIMITS.intros_total)
      : FREE_LIMITS.intros_total;

  if (used >= cap) return { allowed: false, limitReached: true };

  const up = await supabaseAdmin
    .from("usage_limits")
    .upsert(
      {
        user_id: userId,
        plan: row?.plan || "free",
        project_intros_cap:
          row?.project_intros_cap ??
          (plan === "project" ? PROJECT_LIMITS.intros_total : null),
        introductions_used: used + 1,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (up.error) return { allowed: false, hardError: up.error.message };
  return { allowed: true };
}

async function consumeIntroGuest(req: Request) {
  const u = readGuestUsage(req);
  if (u.introductions_used >= FREE_LIMITS.intros_total) {
    return { allowed: false as const, limitReached: true as const };
  }
  const next = { introductions_used: u.introductions_used + 1 };
  return { allowed: true as const, headers: writeGuestUsageHeaders(next) };
}

export async function POST(req: Request) {
  try {
    const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();

    if (!OPENAI_API_KEY) {
      return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    if (!SUPABASE_URL) {
      return Response.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Try auth, but don’t require it (guest mode supported)
    const userId = await getUserIdFromRequest(supabaseAdmin, req);

    const body = (await req.json().catch(() => ({}))) as any;

    const bookTitle = clean(body.bookTitle);
    const purpose = clean(body.purpose);
    const outline = Array.isArray(body.outline) ? body.outline : [];
    const voiceSample = clean(body.voiceSample);
    const voiceNotes = clean(body.voiceNotes);

    // ✅ limits
    let extraHeaders: Record<string, string> = {};
    if (userId) {
      const lim = await consumeIntroSupabase({ supabaseAdmin, userId });
      if (!lim.allowed) {
        if ((lim as any).limitReached) return Response.json({ error: "limit_reached" }, { status: 200 });
        return Response.json(
          { error: "limit_check_failed", details: (lim as any).hardError || "unknown" },
          { status: 500 }
        );
      }
    } else {
      const lim = await consumeIntroGuest(req);
      if (!lim.allowed) return Response.json({ error: "limit_reached" }, { status: 200 });
      extraHeaders = lim.headers || {};
    }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const system = `
You are a writing coach.
Write WITH the author, not for them.
Match tone and cadence.
No AI references. No hype.
Return JSON only.
`.trim();

    const userPrompt = {
      task: "Write a book introduction",
      bookTitle,
      purpose,
      outline,
      voiceNotes,
      voiceSample_snippet: voiceSample ? voiceSample.slice(0, 2000) : "",
      constraints: { minWords: 400, maxWords: 700 },
      output_schema: { introduction: "string" }
    };

    const resp = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPrompt) }
      ],
      response_format: { type: "json_object" }
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {}

    let introduction = parsed.introduction;
    if (typeof introduction !== "string") introduction = "";
    introduction = clean(introduction);

    if (!introduction) {
      return Response.json({ error: "no_introduction_returned" }, { status: 500 });
    }

    return Response.json({ introduction }, { status: 200, headers: extraHeaders });
  } catch (err: any) {
    return Response.json(
      { error: "server_error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}