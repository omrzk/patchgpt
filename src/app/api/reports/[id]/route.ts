import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getDb().prepare("SELECT * FROM reports WHERE id = ?").get(Number(id)) as
    | { id: number; title: string; content: string }
    | undefined;
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (req.nextUrl.searchParams.get("download") === "1") {
    return new NextResponse(report.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.title.replace(/[^a-z0-9 _-]/gi, "")}.md"`,
      },
    });
  }
  return NextResponse.json({ report });
}
