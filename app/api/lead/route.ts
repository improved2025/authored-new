import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const { email, title, purpose, outline, source } = body || {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (!Array.isArray(outline) || outline.length < 1) {
      return NextResponse.json({ error: "missing_outline" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
    }

    const userAgent = (request.headers.get("user-agent") || "").toString().slice(0, 300);
    const ip =
      (request.headers.get("x-forwarded-for") || "").toString().split(",")[0].trim().slice(0, 80);

    // Save lead to Supabase (always do this first)
    const insertPayload = {
      email: email.trim().toLowerCase(),
      source: (source || "guest_outline").toString(),
      title: (title || "").toString().slice(0, 200),
      purpose: (purpose || "").toString().slice(0, 2000),
      outline, // json array
      user_agent: userAgent,
      ip,
    };

    const supaResp = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(insertPayload),
    });

    if (!supaResp.ok) {
      const txt = await supaResp.text().catch(() => "");
      return NextResponse.json(
        { error: "lead_save_failed", details: txt.slice(0, 300) },
        { status: 500 }
      );
    }

    // OPTIONAL: send email (non-fatal)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM_EMAIL = process.env.FROM_EMAIL; // e.g. "Authored <support@myauthored.com>"
    const APP_URL = process.env.APP_URL || ""; // e.g. https://myauthored.com

    let emailed = false;

    if (RESEND_API_KEY && FROM_EMAIL) {
      const subject = "Your Authored outline is saved";

      const outlineLines = outline
        .map((x: any, i: number) => {
          const t = typeof x === "string" ? x : x?.title || `Chapter ${i + 1}`;
          return `${i + 1}. ${String(t)}`;
        })
        .join("\n");

      // Old app used /start.html. In Next, your equivalent is /start.
      // If APP_URL is set, we keep the same intent but point to /start.
      const returnLink = APP_URL ? `${APP_URL.replace(/\/$/, "")}/start` : "/start";

      const textBody = `You started something important.

Here’s the outline you created with Authored. Save this email so you can come back to it anytime.

Title: ${title || "Untitled"}

Purpose:
${purpose || ""}

Outline:
${outlineLines}

Continue writing here:
${returnLink}

— Authored`;

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: email,
          subject,
          text: textBody,
        }),
      });

      emailed = resendResp.ok;
    }

    return NextResponse.json({ ok: true, saved: true, emailed }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// Match your old behavior: any non-POST should be method_not_allowed
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}