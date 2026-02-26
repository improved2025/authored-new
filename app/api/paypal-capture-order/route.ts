// app/api/paypal-capture-order/route.ts
// Captures a PayPal order, then upgrades the user's plan in Supabase usage_limits.
// Requires logged-in user (via Authorization Bearer token OR sb-access-token cookie).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function paypalBase() {
  return PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function basicAuth() {
  const raw = `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`;
  return Buffer.from(raw).toString("base64");
}

function clean(v: any) {
  return (v ?? "").toString().trim();
}
function cleanLower(v: any) {
  return clean(v).toLowerCase();
}

function extractAccessToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m?.[1]) return m[1].trim();

  const cookie = req.headers.get("cookie") || "";
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

async function requireUserId(req: Request) {
  const token = extractAccessToken(req);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

export async function POST(req: Request) {
  try {
    if (!PAYPAL_CLIENT_ID) {
      return NextResponse.json({ error: "Missing PAYPAL_CLIENT_ID" }, { status: 500 });
    }
    if (!PAYPAL_CLIENT_SECRET) {
      return NextResponse.json({ error: "Missing PAYPAL_CLIENT_SECRET" }, { status: 500 });
    }
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const userId = await requireUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const orderID =
      clean(body?.orderID) ||
      clean(body?.orderId) ||
      clean(body?.id) ||
      clean(body?.order_id);

    if (!orderID) {
      return NextResponse.json({ error: "missing_orderID" }, { status: 400 });
    }

    // Capture payment (PayPal)
    const resp = await fetch(
      `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth()}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return NextResponse.json(
        { error: "paypal_capture_failed", details: data },
        { status: 500 }
      );
    }

    // Determine plan from purchase_units description
    const desc = cleanLower(data?.purchase_units?.[0]?.description || "");
    const plan = desc.includes("lifetime") ? "lifetime" : "project";

    // Upgrade user in usage_limits table
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
        { error: "upgrade_failed", details: up.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, plan }, { status: 200 });
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