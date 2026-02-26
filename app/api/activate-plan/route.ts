// app/api/activate-plan/route.ts
// Sets usage_limits.plan for the authenticated user.
// Expects Authorization: Bearer <supabase_access_token> OR sb-access-token cookie
// Body: { plan: "project" | "lifetime" }

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clean(v: any) {
  return (v ?? "").toString().trim();
}

function extractAccessToken(headers: Headers) {
  const auth = headers.get("authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  const cookie = headers.get("cookie") || "";
  const sbAccess = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  if (sbAccess?.[1]) {
    try {
      return decodeURIComponent(sbAccess[1]);
    } catch {
      return sbAccess[1];
    }
  }

  return null;
}

async function getUserIdFromRequest(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const token = extractAccessToken(req.headers);
  if (!token) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

export async function POST(req: Request) {
  try {
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const plan = clean(body?.plan).toLowerCase();

    if (!["project", "lifetime"].includes(plan)) {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const up = await supabaseAdmin
      .from("usage_limits")
      .upsert(
        {
          user_id: userId,
          plan,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (up.error) {
      return NextResponse.json(
        { error: "db_write_failed", details: up.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
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