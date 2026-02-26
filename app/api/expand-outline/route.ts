// app/api/expand-outline/route.ts
export const runtime = "nodejs";

function clean(v: unknown) {
  return (v ?? "").toString().trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const { title, purpose, outline, audience, topic } = body || {};

    const bookTitle = clean(title) || "Untitled";
    const bookPurpose = clean(purpose) || "";
    const aud = clean(audience) || "the intended reader";
    const top = clean(topic) || "the book topic";

    const outlineArr = Array.isArray(outline)
      ? outline.map(clean).filter(Boolean)
      : [];

    if (outlineArr.length === 0) {
      return Response.json({ error: "Missing outline" }, { status: 400 });
    }

    const prompt = `
You are a practical book coach.

Given this book:
Title: ${bookTitle}
Purpose: ${bookPurpose}
Topic: ${top}
Audience: ${aud}

Expand the outline by adding:
- a one-sentence summary for each chapter
- 4–6 key points per chapter (bullets)

Do NOT rewrite the chapter titles.
No hype. No mention of AI.

Return JSON ONLY in this format:
{
  "expandedOutline": [
    { "chapterTitle": "...", "summary": "...", "keyPoints": ["...", "..."] }
  ]
}
`.trim();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in Vercel env vars" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a practical book coach." },
          {
            role: "user",
            content:
              prompt +
              "\n\nOutline:\n" +
              outlineArr.map((x: string, i: number) => `${i + 1}. ${x}`).join("\n")
          }
        ],
        temperature: 0.6
      })
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { error: "OpenAI request failed", details: raw },
        { status: 500 }
      );
    }

    const content = raw?.choices?.[0]?.message?.content || "";
    let data: any;
    try {
      data = JSON.parse(content);
    } catch {
      return Response.json(
        { error: "Model did not return valid JSON", details: content },
        { status: 500 }
      );
    }

    const expanded = Array.isArray(data.expandedOutline) ? data.expandedOutline : [];
    return Response.json({ expandedOutline: expanded }, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { error: "Server error", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}