import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function originFromReq(req: Request) {
  // Prefer forwarded headers on Vercel/proxies
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY)
      return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    if (!SUPABASE_URL)
      return NextResponse.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("session_id") || "").trim();
    if (!sessionId) return NextResponse.json({ error: "Missing session_id" }, { status: 400 });

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || (session.payment_status !== "paid" && session.status !== "complete")) {
      return NextResponse.json({ error: "payment_not_complete" }, { status: 400 });
    }

    const userId = (session.metadata?.user_id || "").toString().trim();
    const plan = (session.metadata?.plan || "").toString().trim().toLowerCase();

    if (!userId) return NextResponse.json({ error: "missing_user_id_metadata" }, { status: 400 });
    if (plan !== "project" && plan !== "lifetime") {
      return NextResponse.json({ error: "invalid_plan_metadata" }, { status: 400 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const up = await supabaseAdmin
      .from("usage_limits")
      .upsert(
        { user_id: userId, plan, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (up.error) {
      return NextResponse.json(
        { error: "supabase_update_failed", details: up.error.message },
        { status: 500 }
      );
    }

    // Redirect back to your Next app route (you said fully Next migration)
    // If your app page is /start (Next), use that.
    // If you still have static start.html, swap to /start.html.
    const origin = originFromReq(req);
    const redirectTo = `${origin}/start?upgraded=${encodeURIComponent(plan)}`;
    return NextResponse.redirect(redirectTo, 303);
  } catch (err: any) {
    return NextResponse.json(
      { error: "stripe_success_failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// Keep legacy behavior: non-GET => 405 JSON
export async function POST() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}