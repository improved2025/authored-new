import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Optional (recommended): set these to validate capture amounts/currency
// PAYPAL_PRICE_PROJECT="49.00" PAYPAL_PRICE_LIFETIME="149.00" PAYPAL_CURRENCY="USD"
const PAYPAL_PRICE_PROJECT = process.env.PAYPAL_PRICE_PROJECT;
const PAYPAL_PRICE_LIFETIME = process.env.PAYPAL_PRICE_LIFETIME;
const PAYPAL_CURRENCY = (process.env.PAYPAL_CURRENCY || "USD").toUpperCase();

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

async function requireCallerUserId(req: Request) {
  const token = extractAccessToken(req.headers);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const u = await authed.auth.getUser();
  return u?.data?.user?.id || null;
}

function parseInvoiceUserId(invoiceId: any) {
  const raw = (invoiceId || "").toString().trim();
  // Expected format: authored:<userId>:<plan>:<timestamp>
  if (!raw.startsWith("authored:")) return null;
  const parts = raw.split(":");
  if (parts.length < 4) return null;
  const userId = (parts[1] || "").trim();
  return userId || null;
}

function isCompletedCapture(data: any) {
  if (data?.status === "COMPLETED") return true;
  const capStatus = (data?.purchase_units?.[0]?.payments?.captures?.[0]?.status || "").toString();
  return capStatus === "COMPLETED";
}

function validateAmountIfConfigured(data: any, plan: "project" | "lifetime") {
  // If env vars aren’t set, skip validation (backwards compatible)
  const expected =
    plan === "lifetime" ? PAYPAL_PRICE_LIFETIME : PAYPAL_PRICE_PROJECT;

  if (!expected) return true;

  const cap = data?.purchase_units?.[0]?.payments?.captures?.[0];
  const amountValue = (cap?.amount?.value || data?.purchase_units?.[0]?.amount?.value || "").toString();
  const currency = (cap?.amount?.currency_code || data?.purchase_units?.[0]?.amount?.currency_code || "").toString().toUpperCase();

  if (!amountValue || !currency) return false;
  if (currency !== PAYPAL_CURRENCY) return false;
  return amountValue === expected;
}

export async function POST(req: Request) {
  try {
    if (!PAYPAL_CLIENT_ID) {
      return NextResponse.json({ error: "missing_paypal_client_id" }, { status: 500 });
    }
    if (!PAYPAL_CLIENT_SECRET) {
      return NextResponse.json({ error: "missing_paypal_client_secret" }, { status: 500 });
    }
    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "missing_supabase_url" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "missing_service_role_key" }, { status: 500 });
    }

    const callerUserId = await requireCallerUserId(req);
    if (!callerUserId) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const orderID = (body?.orderID || "").toString().trim();
    if (!orderID) {
      return NextResponse.json({ error: "missing_orderID" }, { status: 400 });
    }

    // Capture payment
    const resp = await fetch(
      `${paypalBase()}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth()}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return NextResponse.json(
        { error: "paypal_capture_failed", details: data },
        { status: 502 }
      );
    }

    if (!isCompletedCapture(data)) {
      return NextResponse.json(
        { error: "paypal_not_completed", details: { status: data?.status } },
        { status: 400 }
      );
    }

    // Deterministic plan from custom_id
    const planRaw = clean(data?.purchase_units?.[0]?.custom_id);
    const plan =
      planRaw === "project" || planRaw === "lifetime" ? (planRaw as "project" | "lifetime") : null;

    if (!plan) {
      return NextResponse.json(
        { error: "missing_or_invalid_plan", details: { custom_id: data?.purchase_units?.[0]?.custom_id } },
        { status: 400 }
      );
    }

    // Deterministic userId from invoice_id
    const invoiceId = data?.purchase_units?.[0]?.invoice_id;
    const invoiceUserId = parseInvoiceUserId(invoiceId);

    if (!invoiceUserId) {
      return NextResponse.json(
        { error: "missing_or_invalid_invoice_id", details: { invoice_id: invoiceId } },
        { status: 400 }
      );
    }

    // Prevent capturing and upgrading someone else
    if (invoiceUserId !== callerUserId) {
      return NextResponse.json(
        { error: "user_mismatch", details: { caller: callerUserId, invoiceUser: invoiceUserId } },
        { status: 403 }
      );
    }

    // Optional amount validation (if env configured)
    if (!validateAmountIfConfigured(data, plan)) {
      return NextResponse.json(
        { error: "amount_validation_failed" },
        { status: 400 }
      );
    }

    // Upgrade user in usage_limits table
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const up = await supabaseAdmin
      .from("usage_limits")
      .upsert(
        { user_id: invoiceUserId, plan, updated_at: new Date().toISOString() },
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