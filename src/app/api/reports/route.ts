import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateComplianceReport, generateDeploymentReport } from "@/lib/reports";

export async function GET() {
  const reports = getDb()
    .prepare("SELECT id, type, title, created_at FROM reports ORDER BY id DESC")
    .all();
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  try {
    const { type, planId } = await req.json();
    const report =
      type === "deployment" ? generateDeploymentReport(Number(planId)) : generateComplianceReport();
    const info = getDb()
      .prepare("INSERT INTO reports (type, title, created_at, content) VALUES (?, ?, ?, ?)")
      .run(type ?? "compliance", report.title, new Date().toISOString(), report.content);
    return NextResponse.json({ id: info.lastInsertRowid, title: report.title });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
