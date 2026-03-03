import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

function clean(v: unknown) {
  return (v ?? "").toString().trim();
}

export async function POST(req: Request) {
  try {
    const apiKeyOk = !!process.env.RESEND_API_KEY;
    if (!apiKeyOk) {
      return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const email = clean(body.email);
    const title = clean(body.title) || "Your Authored outline";
    const purpose = clean(body.purpose);
    const outline = Array.isArray(body.outline) ? body.outline : [];

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
    }
    if (!outline.length) {
      return NextResponse.json({ ok: false, error: "Outline missing" }, { status: 400 });
    }

    const text = [
      `Working title: ${title}`,
      purpose ? `\nPurpose:\n${purpose}` : "",
      `\nOutline:\n${outline.map((x: any, i: number) => `${i + 1}. ${typeof x === "string" ? x : x?.title || ""}` ).join("\n")}`,
      `\n\n— Authored (myauthored.com)`
    ].join("");

    // IMPORTANT: use a verified sender domain in Resend
    const from = process.env.RESEND_FROM || "Authored <onboarding@resend.dev>";

    const sent = await resend.emails.send({
      from,
      to: email,
      subject: "Your Authored outline",
      text,
    });

    return NextResponse.json({ ok: true, sent }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}