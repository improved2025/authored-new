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
  const token = extractAccessToken(req.headers);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

function originFromReq(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

async function handler(req: Request, planFromQuery?: string) {
  if (!STRIPE_SECRET_KEY)
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  if (!STRIPE_PRICE_PROJECT)
    return NextResponse.json({ error: "Missing STRIPE_PRICE_PROJECT" }, { status: 500 });
  if (!STRIPE_PRICE_LIFETIME)
    return NextResponse.json({ error: "Missing STRIPE_PRICE_LIFETIME" }, { status: 500 });

  const userId = await getUserIdFromRequest(req);
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

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
  const origin = originFromReq(req);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    // keep old behavior (hits your API route after payment)
    success_url: `${origin}/api/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
    // fully-next migration: change to /pricing if you have a Next page
    cancel_url: `${origin}/pricing?canceled=1`,
    metadata: { user_id: userId, plan },
  });

  // Redirect browser to Stripe hosted checkout
  return NextResponse.redirect(session.url as string, 303);
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

// Keep legacy behavior: non-GET/POST => 405 JSON
export async function PUT() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}