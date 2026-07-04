import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { explainPatch } from "@/lib/ai";
import type { Patch } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { kb, force } = await req.json();
    const patch = getDb().prepare("SELECT * FROM patches WHERE kb = ?").get(kb) as Patch | undefined;
    if (!patch) return NextResponse.json({ error: `Unknown KB: ${kb}` }, { status: 404 });
    const result = await explainPatch(patch, !!force);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
