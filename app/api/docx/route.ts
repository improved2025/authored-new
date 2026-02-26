// app/api/docx/route.ts
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const runtime = "nodejs";

function cleanName(name = "authored.docx") {
  const base = String(name).trim() || "authored.docx";
  const safe = base.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
  return safe.toLowerCase().endsWith(".docx") ? safe : `${safe}.docx`;
}

function splitLines(text = "") {
  return String(text).replace(/\r\n/g, "\n").split("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const filename = cleanName(body.filename || "authored.docx");
    const title = (body.title || "").toString().trim();
    const content = (body.content || "").toString();

    if (!content.trim()) {
      return Response.json({ error: "Missing content" }, { status: 400 });
    }

    const paragraphs: Paragraph[] = [];

    if (title) {
      paragraphs.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
      paragraphs.push(new Paragraph({ text: "" }));
    }

    const lines = splitLines(content);
    for (const line of lines) {
      if (!line.trim()) {
        paragraphs.push(new Paragraph({ text: "" }));
        continue;
      }
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }

    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(doc);

    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // ✅ Buffer -> true ArrayBuffer slice
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;

    const blob = new Blob([ab], { type: mime });

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err?.message || "DOCX error" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: "Use POST" }, { status: 405 });
}