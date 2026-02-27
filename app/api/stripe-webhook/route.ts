import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clean(v: any) {
  return (v ?? "").toString().trim().toLowerCase();
}

function ok() {
  // Always acknowledge quickly with 200 so Stripe doesn’t keep retrying non-actionable events
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "missing_stripe_env" },
        { status: 500 }
      );
    }
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "missing_supabase_url" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "missing_service_role_key" }, { status: 500 });
    }

    // Don’t pin apiVersion unless you must; Stripe TS types can break builds.
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    // App Router: use raw body bytes
    const rawBody = Buffer.from(await req.arrayBuffer());
    const sig = req.headers.get("stripe-signature") || "";

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      // Stripe must receive 400 for invalid signature, otherwise it will keep retrying forever
      return new NextResponse(
        `Webhook Error: ${err?.message || "Invalid signature"}`,
        { status: 400 }
      );
    }

    // Only act on checkout completion
    if (event.type !== "checkout.session.completed") {
      return ok();
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Be permissive here: Stripe can represent “paid/complete” slightly differently across flows.
    const paymentPaid =
      session.payment_status === "paid" || session.status === "complete";

    if (!paymentPaid) return ok();

    const userId = (session.metadata?.user_id || "").toString().trim();
    const plan = clean(session.metadata?.plan);

    if (!userId) return ok();
    if (plan !== "project" && plan !== "lifetime") return ok();

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const payload = {
      user_id: userId,
      plan,
      updated_at: new Date().toISOString(),
    };

    // This one must succeed. If it fails, return 500 so Stripe retries.
    const up1 = await supabaseAdmin
      .from("usage_limits")
      .upsert(payload, { onConflict: "user_id" });

    if (up1.error) {
      return NextResponse.json(
        { error: "usage_limits_upsert_failed", details: up1.error.message },
        { status: 500 }
      );
    }

    // Best-effort legacy table; ignore if it doesn’t exist.
    try {
      const up2 = await supabaseAdmin
        .from("usable_limits")
        .upsert(payload, { onConflict: "user_id" });

      // If table exists but write fails, still don’t fail the webhook.
      // usage_limits is the source of truth.
      void up2;
    } catch {
      // ignore
    }

    return ok();
  } catch (err: any) {
    // For unexpected failures, return 500 so Stripe retries.
    return NextResponse.json(
      { error: "webhook_server_error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// Keep legacy behavior
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}