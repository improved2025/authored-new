// app/api/lead/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";

function clean(v: any) {
  return (v ?? "").toString().trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function outlineToText(outline: any[]) {
  const items = Array.isArray(outline) ? outline : [];
  return items
    .map((x, i) => {
      const t = clean(x?.title);
      return t ? `${i + 1}. ${t}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// tiny helper for HTML safety
function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    const RESEND_FROM = process.env.RESEND_FROM || "Authored <onboarding@resend.dev>";

    if (!SUPABASE_URL) {
      return NextResponse.json({ error: "Missing SUPABASE_URL" }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as any;

    const email = clean(body.email).toLowerCase();
    const title = clean(body.title) || "Your outline";
    const purpose = clean(body.purpose);
    const source = clean(body.source) || "guest_outline";
    const outline = Array.isArray(body.outline) ? body.outline : [];

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (!outline.length) {
      return NextResponse.json({ error: "missing_outline" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Save lead (always)
    const insert = await supabase
      .from("leads")
      .insert({
        email,
        source,
        title,
        purpose,
        outline, // jsonb column
      })
      .select("id")
      .single();

    if (insert.error) {
      return NextResponse.json(
        { error: "db_insert_failed", details: insert.error.message },
        { status: 500 }
      );
    }

    // 2) Try email (best-effort, but RETURN REAL ERROR for debugging)
    let emailed = false;
    let email_error: string | null = null;

    if (!RESEND_API_KEY) {
      email_error = "missing_resend_api_key";
    } else {
      try {
        const resend = new Resend(RESEND_API_KEY);

        const outlineText = outlineToText(outline);

        const subject = `Your Authored outline: ${title}`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height:1.5; color:#111;">
            <h2 style="margin:0 0 10px;">Here’s your outline</h2>
            <p style="margin:0 0 10px;"><strong>Title:</strong> ${escapeHtml(title)}</p>
            ${
              purpose
                ? `<p style="margin:0 0 10px;"><strong>Purpose:</strong> ${escapeHtml(purpose)}</p>`
                : ""
            }
            <pre style="background:#fafafa;border:1px solid #eee;padding:12px;border-radius:10px;font-size:13px;white-space:pre-wrap;">${escapeHtml(
              outlineText
            )}</pre>
            <p style="margin:14px 0 0; font-size:12px; color:#555;">
              You can create a free account to expand chapters and save your project.
            </p>
          </div>
        `.trim();

        const sent: any = await resend.emails.send({
          from: RESEND_FROM,
          to: email,
          subject,
          html,
        });

        // Surface Resend error if present
        if (sent?.error) {
          email_error = sent.error?.message || "resend_error";
        } else if (sent?.data?.id || sent?.id) {
          emailed = true;
        } else {
          email_error = "resend_unknown_response";
        }

        // Optional: store emailed status
        if (emailed) {
          await supabase.from("leads").update({ emailed: true }).eq("id", insert.data.id);
        }
      } catch (e: any) {
        email_error = e?.message || String(e);
      }
    }

    return NextResponse.json(
      { ok: true, emailed, email_error, lead_id: insert.data.id },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}