import { getDb } from "@/lib/db";
import { ReportsView } from "./reports-view";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const reports = getDb()
    .prepare("SELECT id, type, title, created_at FROM reports ORDER BY id DESC")
    .all() as { id: number; type: string; title: string; created_at: string }[];

  return (
    <>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">
        Compliance and deployment reports, generated from live data and downloadable as Markdown
        for change tickets and audits.
      </p>
      <ReportsView reports={reports} />
    </>
  );
}
