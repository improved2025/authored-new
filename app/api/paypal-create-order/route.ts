import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const PRICE_USD: Record<string, string> = {
  project: "49.00",
  lifetime: "149.00",
};

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
  return (v ?? "").toString().trim().toLowerCase();
}

function extractAccessToken(headers: Headers) {
  const auth = headers.get("authorization") || headers.get("Authorization") || "";
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

async function requireUserId(req: Request) {
  const token = extractAccessToken(req.headers);
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
      return NextResponse.json({ error: "missing_paypal_client_id" }, { status: 500 });
    }
    if (!PAYPAL_CLIENT_SECRET) {
      return NextResponse.json({ error: "missing_paypal_client_secret" }, { status: 500 });
    }

    const userId = await requireUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const plan = clean(body?.plan);
    if (plan !== "project" && plan !== "lifetime") {
      return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
    }

    const amount = PRICE_USD[plan];
    if (!amount) {
      return NextResponse.json({ error: "invalid_plan_amount" }, { status: 400 });
    }

    // Make this deterministic for capture:
    // - custom_id carries plan (project/lifetime)
    // - invoice_id carries userId (so capture can bind it to the right user)
    // NOTE: invoice_id is meant to be unique; we make it unique per request.
    const invoiceId = `authored:${userId}:${plan}:${Date.now()}`;

    const resp = await fetch(`${paypalBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: amount },

            // Deterministic machine fields:
            custom_id: plan,
            invoice_id: invoiceId,

            // Human readable:
            description: `Authored ${plan} plan`,
          },
        ],
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.id) {
      return NextResponse.json(
        { error: "paypal_create_order_failed", details: data },
        { status: 502 }
      );
    }

    // Return invoiceId too (optional but useful for debugging / support)
    return NextResponse.json({ orderID: data.id, invoiceId }, { status: 200 });
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