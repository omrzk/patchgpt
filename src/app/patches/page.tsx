import { getDb } from "@/lib/db";
import { getAllPriorities } from "@/lib/engine";
import type { Patch } from "@/lib/types";
import { PatchList } from "./patch-list";

export const dynamic = "force-dynamic";

export default function PatchesPage() {
  const db = getDb();
  const patches = db.prepare("SELECT * FROM patches").all() as Patch[];
  const priorities = getAllPriorities();
  const serverNames = new Map(
    (db.prepare("SELECT id, name FROM servers").all() as { id: string; name: string }[]).map((s) => [s.id, s.name])
  );

  const rows = priorities.map((p) => {
    const patch = patches.find((x) => x.kb === p.kb)!;
    return {
      priority: p,
      patch,
      affectedNames: p.affectedServers.map((id) => serverNames.get(id) ?? id),
    };
  });

  return (
    <>
      <h1 className="page-title">Patches</h1>
      <p className="page-sub">
        Every patch in the catalog, ranked by the priority engine. &ldquo;Explain&rdquo; asks the AI to break
        down security fixes, breaking changes, known issues, CVE severity, and business impact for
        your environment.
      </p>
      <PatchList rows={rows} />
    </>
  );
}
