// app/api/_supabase/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { ok: false, message: "_supabase placeholder route (disabled)" },
    { status: 503 }
  );
}

export async function POST() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}