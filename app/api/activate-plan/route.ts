// app/api/activate-plan/route.ts
// Sets usage_limits.plan for the authenticated user.
// Expects Authorization: Bearer <token> OR cookie sb-access-token
// app/api/activate-plan/route.ts
// Sets usage_limits.plan for the authenticated user.
// Expects Authorization: Bearer <token> OR cookie sb-access-token
// Body: { plan: "project" | "lifetime" }

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function clean(v: unknown) {
  return (v ?? "").toString().trim().toLowerCase();
}

function extractAccessToken(req: Request) {
  // 1) Authorization header
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  // 2) Cookie sb-access-token
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]);

  return null;
}

async function getUserIdFromRequest(req: Request) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const token = extractAccessToken(req);
  if (!url || !anon || !token) return null;

  const authed = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const plan = clean(body?.plan);

    if (plan !== "project" && plan !== "lifetime") {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const sb = supabaseAdmin();
    const up = await sb
      .from("usage_limits")
      .upsert(
        { user_id: userId, plan, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (up.error) {
      return NextResponse.json(
        { error: "db_write_failed", details: up.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
