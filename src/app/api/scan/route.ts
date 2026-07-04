import { NextRequest, NextResponse } from "next/server";
import { runScan, connectorStatus } from "@/lib/connectors";

export async function GET() {
  return NextResponse.json({ connectors: connectorStatus() });
}

export async function POST(req: NextRequest) {
  try {
    const { source } = await req.json();
    const result = await runScan(source ?? "demo");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
