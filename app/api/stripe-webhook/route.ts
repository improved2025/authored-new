import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Stripe requires the raw body. This tells Next not to parse it.
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      return new NextResponse("Missing Stripe webhook env vars", { status: 500 });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new NextResponse("Missing Supabase service env vars", { status: 500 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    // IMPORTANT: raw body
    const rawBody = await req.text();

    const sig = req.headers.get("stripe-signature");
    if (!sig) return new NextResponse("Missing stripe-signature header", { status: 400 });

    const event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);

    // Only handle what we need
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const userId = (session.metadata?.user_id || "").toString().trim();
    const plan = (session.metadata?.plan || "").toString().trim().toLowerCase();

    if (!userId || (plan !== "project" && plan !== "lifetime")) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // NOTE: your old code had a typo table name "usable_limits".
    // I’m keeping it but making it non-fatal so builds don’t break if it doesn't exist.
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("usage_limits")
      .upsert({ user_id: userId, plan, updated_at: now }, { onConflict: "user_id" });

    // Optional: keep this if you truly have the table. If not, delete it.
    await supabaseAdmin
      .from("usable_limits")
      .upsert({ user_id: userId, plan, updated_at: now }, { onConflict: "user_id" });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    // Stripe expects a 400 on signature/body failures
    return new NextResponse(`Webhook Error: ${String(err?.message || err)}`, { status: 400 });
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