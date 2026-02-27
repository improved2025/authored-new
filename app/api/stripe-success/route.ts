import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function originFromReq(req: Request) {
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (req.headers.get("host")?.includes("localhost") ? "http" : "https");

  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "";

  const envOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "";

  if (!host && envOrigin) return envOrigin.replace(/\/+$/, "");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function redirectStart(req: Request, qs: Record<string, string>) {
  const origin = originFromReq(req);
  const params = new URLSearchParams(qs);
  return NextResponse.redirect(`${origin}/start?${params.toString()}`, 303);
}

export async function GET(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "missing_stripe_secret_key" }, { status: 500 });
    }
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "missing_supabase_url" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "missing_service_role_key" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("session_id") || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      // Don’t hard-fail; bounce user back.
      return redirectStart(req, { upgraded: "0", error: "missing_session" });
    }

    const isPaid =
      session.payment_status === "paid" || session.status === "complete";

    if (!isPaid) {
      // Stripe can lag; don’t show a scary error page.
      // Let the user land on /start and we can show a “processing payment” message there later.
      return redirectStart(req, { pending: "1" });
    }

    const userId = (session.metadata?.user_id || "").toString().trim();
    const plan = (session.metadata?.plan || "").toString().trim().toLowerCase();

    if (!userId) {
      return redirectStart(req, { upgraded: "0", error: "missing_user_id_metadata" });
    }
    if (plan !== "project" && plan !== "lifetime") {
      return redirectStart(req, { upgraded: "0", error: "invalid_plan_metadata" });
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
      // Return 500 so you see it, but still don’t strand the user on a JSON error page
      return redirectStart(req, { upgraded: "0", error: "entitlement_write_failed" });
    }

    return redirectStart(req, { upgraded: plan });
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