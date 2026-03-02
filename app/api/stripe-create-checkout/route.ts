import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_PROJECT = process.env.STRIPE_PRICE_PROJECT;
const STRIPE_PRICE_LIFETIME = process.env.STRIPE_PRICE_LIFETIME;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function clean(v: any) {
  return (v ?? "").toString().trim().toLowerCase();
}

function extractAccessToken(headers: Headers) {
  // 1) Authorization: Bearer <token>
  const auth = headers.get("authorization") || headers.get("Authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  // 2) Cookie fallback (legacy)
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

async function getUserFromRequest(req: Request) {
  const token = extractAccessToken(req.headers);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user || null;
}

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

async function handler(req: Request, planFromQuery?: string) {
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "missing_stripe_secret_key" }, { status: 500 });
  }
  if (!STRIPE_PRICE_PROJECT) {
    return NextResponse.json({ error: "missing_stripe_price_project" }, { status: 500 });
  }
  if (!STRIPE_PRICE_LIFETIME) {
    return NextResponse.json({ error: "missing_stripe_price_lifetime" }, { status: 500 });
  }

  const user = await getUserFromRequest(req);
  const userId = user?.id || null;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // plan can come from query (?plan=project) OR POST body
  let plan = clean(planFromQuery);
  if (!plan) {
    const body = (await req.json().catch(() => ({}))) as any;
    plan = clean(body?.plan);
  }

  const priceId =
    plan === "project"
      ? STRIPE_PRICE_PROJECT
      : plan === "lifetime"
      ? STRIPE_PRICE_LIFETIME
      : null;

  if (!priceId) return NextResponse.json({ error: "invalid_plan" }, { status: 400 });

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const origin = originFromReq(req);

  if (!origin.startsWith("http")) {
    return NextResponse.json(
      { error: "invalid_origin", details: `Could not determine origin from request headers.` },
      { status: 500 }
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],

    // ✅ Success is UX-only. Webhook is the single source of truth for entitlements.
    // If you don't need the session_id on the client, you can remove it from the URL.
    success_url: `${origin}/start?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?canceled=1`,

    // ✅ Keep only what the webhook needs.
    metadata: { plan },

    // ✅ Strong binding: webhook should prefer this for user id.
    client_reference_id: userId,

    customer_email: user?.email || undefined,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "stripe_session_missing_url" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(session.url, 303);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const plan = searchParams.get("plan") || "";
    return await handler(req, plan);
  } catch (err: any) {
    return NextResponse.json(
      { error: "stripe_checkout_failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (err: any) {
    return NextResponse.json(
      { error: "stripe_checkout_failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}