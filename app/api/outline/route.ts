// app/api/outline/route.ts
// Outline generation (UNLIMITED) with strict JSON output + strong error visibility

import OpenAI from "openai";
import { NextResponse } from "next/server";

function clean(v: any) {
  return (v ?? "").toString().trim();
}

export async function POST(request: Request) {
  // ---- ENV sanity ----
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing OPENAI_API_KEY",
        hint:
          "Vercel → Project → Settings → Environment Variables → add OPENAI_API_KEY (all environments) → Redeploy",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const topic = clean(body.topic);
    const audience = clean(body.audience) || "general readers";
    const blocker = clean(body.blocker) || "none";
    const chaptersRaw = parseInt(body.chapters, 10);
    const chapters = Number.isFinite(chaptersRaw) ? chaptersRaw : 12;

    const voiceSample = clean(body.voiceSample);
    const voiceNotes = clean(body.voiceNotes);

    if (!topic)
      return NextResponse.json({ error: "Missing topic" }, { status: 400 });

    if (chapters < 3 || chapters > 30) {
      return NextResponse.json(
        { error: "Invalid chapters (must be 3–30)" },
        { status: 400 }
      );
    }

    const voiceBlock = voiceSample
      ? `VOICE SAMPLE (match tone and phrasing STRICTLY; do not sound robotic):
${voiceSample}

VOICE NOTES:
${voiceNotes || "none"}`
      : `VOICE NOTES:
${voiceNotes || "none"} (Keep voice natural and human.)`;

    const system = `
You are a professional book coach.
You are writing WITH the author, not for them.
Return ONLY valid JSON (no markdown, no commentary).

Schema (EXACT):
{
  "title": "string",
  "purpose": "string",
  "outline": [
    { "chapter": 1, "title": "string", "bullets": ["string","string","string"] }
  ]
}

Rules:
- outline.length MUST equal chapters requested
- chapters start at 1 and are sequential
- bullets: 3 to 5 per chapter
- Practical, clear, non-robotic
- Respect the author voice sample/notes
`.trim();

    const user = `
Topic: ${topic}
Audience: ${audience}
Main blocker: ${blocker}
Chapters requested: ${chapters}

${voiceBlock}

Create a clear starter outline that helps the user write.
`.trim();

    const openai = new OpenAI({ apiKey });

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = resp?.choices?.[0]?.message?.content || "";

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "OpenAI returned invalid JSON",
          raw_preview: raw.slice(0, 800),
        },
        { status: 500 }
      );
    }

    const title = clean(data.title) || topic;
    const purpose = clean(data.purpose) || `A practical guide about ${topic}.`;

    let outline = Array.isArray(data.outline) ? data.outline : [];

    if (outline.length !== chapters) {
      outline = outline.slice(0, chapters);
      while (outline.length < chapters) {
        const n = outline.length + 1;
        outline.push({
          chapter: n,
          title: `Chapter ${n}`,
          bullets: ["Key idea", "Example", "Action step"],
        });
      }
    }

    outline = outline.map((c: any, i: number) => ({
      chapter: Number.isFinite(Number(c.chapter))
        ? Number(c.chapter)
        : i + 1,
      title: clean(c.title) || `Chapter ${i + 1}`,
      bullets:
        Array.isArray(c.bullets) && c.bullets.length
          ? c.bullets.map(clean).filter(Boolean).slice(0, 5)
          : ["Key idea", "Example", "Action step"],
    }));

    return NextResponse.json({ title, purpose, outline }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Outline generation failed",
        details: clean(err?.message || err),
        env: {
          hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        },
      },
      { status: 500 }
    );
  }
}