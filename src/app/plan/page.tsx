import { getDb } from "@/lib/db";
import { getAllPriorities } from "@/lib/engine";
import type { Patch, Server } from "@/lib/types";
import { PlanBuilder } from "./plan-builder";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  const db = getDb();
  const priorities = getAllPriorities().filter((p) => p.affectedServers.length > 0);
  const patches = new Map(
    (db.prepare("SELECT * FROM patches").all() as Patch[]).map((p) => [p.kb, p])
  );
  const servers = db.prepare("SELECT * FROM servers").all() as Server[];
  const plans = db.prepare("SELECT * FROM plans ORDER BY id DESC").all() as {
    id: number;
    name: string;
    status: string;
    created_at: string;
    content: string;
  }[];

  return (
    <>
      <h1 className="page-title">Deployment Plans</h1>
      <p className="page-sub">
        Select patches; the engine assigns servers to rings (burn-in first, cluster nodes split
        across windows, business-critical last) and the AI writes the rationale a change advisory
        board would ask for.
      </p>
      <PlanBuilder
        candidates={priorities.map((p) => ({
          kb: p.kb,
          title: patches.get(p.kb)?.title ?? p.kb,
          tier: p.tier,
          score: p.score,
          affected: p.affectedServers.length,
        }))}
        servers={servers.map((s) => ({ id: s.id, name: s.name, role: s.role }))}
        existingPlans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          created_at: p.created_at,
          ...JSON.parse(p.content),
        }))}
      />
    </>
  );
}
