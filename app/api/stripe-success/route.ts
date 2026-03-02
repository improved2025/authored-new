import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

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
      // Still avoid stranding user on a JSON error page
      return redirectStart(req, { stripe: "error", code: "missing_stripe_secret_key" });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = (searchParams.get("session_id") || "").trim();

    if (!sessionId) {
      return redirectStart(req, { stripe: "error", code: "missing_session_id" });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return redirectStart(req, { stripe: "error", code: "missing_session" });
    }

    // UX-only: never grant entitlements here.
    // Webhook is the single source of truth for plan activation.
    const isPaid =
      session.payment_status === "paid" || session.status === "complete";

    if (!isPaid) {
      return redirectStart(req, { stripe: "pending" });
    }

    // Optional: pass helpful context for UI messaging only.
    const plan = (session.metadata?.plan || "").toString().trim().toLowerCase();
    const userRef = (session.client_reference_id || "").toString().trim();

    const qs: Record<string, string> = { stripe: "success" };
    if (plan === "project" || plan === "lifetime") qs.plan = plan;
    if (userRef) qs.user = userRef;

    return redirectStart(req, qs);
  } catch (err: any) {
    return redirectStart(req, {
      stripe: "error",
      code: "stripe_success_failed",
    });
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