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

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildSignupUrl(email: string) {
  return `https://www.myauthored.com/signup?next=/start&email=${encodeURIComponent(email)}`;
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
    const RESEND_FROM = process.env.FROM_EMAIL || "Authored <onboarding@resend.dev>";

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

    const insert = await supabase
      .from("leads")
      .insert({ email, source, title, purpose, outline })
      .select("id")
      .single();

    if (insert.error) {
      return NextResponse.json(
        { error: "db_insert_failed", details: insert.error.message },
        { status: 500 }
      );
    }

    let emailed = false;
    let email_error: string | null = null;
    let resend_id: string | null = null;

    if (!RESEND_API_KEY) {
      email_error = "missing_resend_api_key";
    } else {
      try {
        const resend = new Resend(RESEND_API_KEY);

        const outlineText = outlineToText(outline);
        const subject = `Your Authored outline: ${title}`;
        const signupUrl = buildSignupUrl(email);

        const html = `
          <div style="font-family: Arial, sans-serif; line-height:1.6; color:#111; max-width:680px; margin:0 auto;">
            <h2 style="margin:0 0 10px;">Your Authored outline is ready</h2>

            <p style="margin:0 0 16px; color:#333;">
              Your outline is below. Want to keep writing and save your draft in Authored?
            </p>

            <p style="margin:0 0 18px;">
              <a
                href="${signupUrl}"
                style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding:12px 18px; border-radius:10px; font-weight:700;"
              >
                Create your free account
              </a>
            </p>

            <p style="margin:0 0 10px;"><strong>Title:</strong> ${escapeHtml(title)}</p>
            ${purpose ? `<p style="margin:0 0 10px;"><strong>Purpose:</strong> ${escapeHtml(purpose)}</p>` : ""}

            <pre style="background:#fafafa;border:1px solid #eee;padding:12px;border-radius:10px;font-size:13px;white-space:pre-wrap;">${escapeHtml(
              outlineText
            )}</pre>

            <p style="margin:16px 0 8px; color:#333;">
              Create a free account to continue building this draft inside Authored.
            </p>

            <p style="margin:0 0 16px;">
              <a href="${signupUrl}" style="color:#111; font-weight:700;">
                Create your free account
              </a>
            </p>

            <p style="margin:0; font-size:12px; color:#666;">
              Authored • <a href="https://www.myauthored.com" style="color:#666;">www.myauthored.com</a>
            </p>
          </div>
        `.trim();

        const sent = await resend.emails.send({
          from: RESEND_FROM,
          to: [email],
          subject,
          html,
        });

        const id = (sent as any)?.data?.id || (sent as any)?.id || null;
        if (id) {
          emailed = true;
          resend_id = String(id);
        } else {
          email_error = JSON.stringify(sent);
        }
      } catch (e: any) {
        email_error = String(e?.message || e);
        console.error("RESEND_SEND_FAILED", { email, from: RESEND_FROM, error: email_error });
      }
    }

    try {
      await supabase
        .from("leads")
        .update({ emailed, email_error, resend_id })
        .eq("id", insert.data.id);
    } catch {}

    return NextResponse.json(
      {
        ok: true,
        emailed,
        email_error,
        resend_id,
        from: RESEND_FROM,
      },
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