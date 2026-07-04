import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { explainPlan } from "@/lib/ai";
import { recommendWindows } from "@/lib/engine";
import type { Server } from "@/lib/types";

export async function GET() {
  const plans = getDb().prepare("SELECT * FROM plans ORDER BY id DESC").all();
  return NextResponse.json({ plans });
}

/**
 * Create a deployment plan. Ring assignment is deterministic:
 *  Ring 1 — staging / low-criticality burn-in
 *  Ring 2 — production standard + one node from each cluster
 *  Ring 3 — business-critical + remaining cluster nodes (never both nodes together)
 * The AI then explains the result.
 */
export async function POST(req: NextRequest) {
  try {
    const { name, kbs } = (await req.json()) as { name: string; kbs: string[] };
    if (!name || !kbs?.length) {
      return NextResponse.json({ error: "name and kbs are required" }, { status: 400 });
    }
    const db = getDb();

    const placeholders = kbs.map(() => "?").join(",");
    const affected = db
      .prepare(
        `SELECT DISTINCT s.* FROM servers s JOIN server_patches sp ON sp.server_id = s.id
         WHERE sp.status = 'missing' AND sp.kb IN (${placeholders})`
      )
      .all(...kbs) as Server[];
    if (!affected.length) {
      return NextResponse.json({ error: "No servers are missing the selected patches" }, { status: 400 });
    }

    const ring1: Server[] = [];
    const ring2: Server[] = [];
    const ring3: Server[] = [];
    const clusterSeen = new Set<string>();
    for (const s of [...affected].sort((a, b) => a.criticality - b.criticality)) {
      if (s.environment !== "production" || s.criticality <= 2) {
        ring1.push(s);
      } else if (s.cluster) {
        // First node of each cluster goes earlier; its peer goes last.
        if (!clusterSeen.has(s.cluster)) {
          clusterSeen.add(s.cluster);
          ring2.push(s);
        } else {
          ring3.push(s);
        }
      } else if (s.criticality >= 4) {
        ring3.push(s);
      } else {
        ring2.push(s);
      }
    }

    const windowFor = (list: Server[], fallback: string) =>
      list.length ? `${recommendWindows(list[0])[0].start}–${recommendWindows(list[0])[0].end}` : fallback;

    const rings = [
      { name: "Burn-in (staging & low impact)", serverIds: ring1.map((s) => s.id), window: windowFor(ring1, "Weekday 19:00–22:00") },
      { name: "Production standard + first cluster nodes", serverIds: ring2.map((s) => s.id), window: windowFor(ring2, "Sat 22:00–Sun 02:00") },
      { name: "Business-critical + remaining cluster nodes", serverIds: ring3.map((s) => s.id), window: windowFor(ring3, "Sun 02:00–05:00") },
    ].filter((r) => r.serverIds.length > 0);

    const { rationale, model } = await explainPlan({ name, kbs, rings });

    const content = JSON.stringify({ kbs, rings, rationale, rationaleModel: model });
    const info = db
      .prepare("INSERT INTO plans (name, status, created_at, content) VALUES (?, 'draft', ?, ?)")
      .run(name, new Date().toISOString(), content);

    return NextResponse.json({ id: info.lastInsertRowid, name, kbs, rings, rationale, model });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
