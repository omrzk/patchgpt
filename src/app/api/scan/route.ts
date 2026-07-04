import { NextRequest, NextResponse } from "next/server";
import { runScan, connectorStatus } from "@/lib/connectors";
import { isDemoMode } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ connectors: connectorStatus() });
}

export async function POST(req: NextRequest) {
  try {
    const { source } = await req.json();
    if (isDemoMode() && source && source !== "demo") {
      return NextResponse.json(
        { error: "Demo mode: only the simulated scan is available." },
        { status: 403 }
      );
    }
    const result = await runScan(source ?? "demo");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
