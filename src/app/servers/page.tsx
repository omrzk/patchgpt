import { getDb } from "@/lib/db";
import { predictReboot, recommendWindows } from "@/lib/engine";
import type { Server } from "@/lib/types";
import { ScanButton } from "./scan-button";

export const dynamic = "force-dynamic";

export default function ServersPage() {
  const db = getDb();
  const servers = db
    .prepare("SELECT * FROM servers ORDER BY criticality DESC, name")
    .all() as Server[];
  const missingCounts = new Map(
    (db
      .prepare("SELECT server_id, COUNT(*) AS n FROM server_patches WHERE status='missing' GROUP BY server_id")
      .all() as { server_id: string; n: number }[]).map((r) => [r.server_id, r.n])
  );

  return (
    <>
      <h1 className="page-title">Servers</h1>
      <p className="page-sub">
        Inventory from the last scan, with the reboot-impact prediction and the recommended
        maintenance window for each machine — and the reasoning behind both.
      </p>
      <div className="toolbar">
        <ScanButton />
      </div>

      {servers.map((s) => {
        const impact = predictReboot(s);
        const windows = recommendWindows(s);
        const missing = missingCounts.get(s.id) ?? 0;
        return (
          <div className="card" key={s.id} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15.5 }}>{s.name}</strong>
              <span className="dim small">{s.os} · {s.role} · {s.ip}</span>
              {s.cluster && <span className="badge accent">cluster {s.cluster}</span>}
              {s.internet_facing === 1 && <span className="badge high">internet-facing</span>}
              {s.pending_reboot === 1 && <span className="badge medium">pending reboot</span>}
              <span className={`badge ${missing === 0 ? "ok" : missing > 2 ? "critical" : "medium"}`}>
                {missing === 0 ? "compliant" : `${missing} missing update${missing === 1 ? "" : "s"}`}
              </span>
              <span className="spacer" />
              <span className="dim small">
                criticality {s.criticality}/5 · uptime {s.uptime_days}d · hours {s.business_hours}
              </span>
            </div>

            <div className="grid cols-2" style={{ marginTop: 14 }}>
              <div>
                <h4 className="small" style={{ margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", fontSize: 11.5 }}>
                  Reboot impact prediction
                </h4>
                <div style={{ marginBottom: 6 }}>
                  <span className={`badge ${impact.risk === "high" ? "critical" : impact.risk === "medium" ? "medium" : "ok"}`}>
                    {impact.risk} risk
                  </span>{" "}
                  <span className="small">
                    {impact.requiresReboot
                      ? `~${impact.estimatedMinutes} min estimated outage`
                      : "no reboot required by missing updates"}
                  </span>
                </div>
                <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
                  {impact.factors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="small" style={{ margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", fontSize: 11.5 }}>
                  Recommended maintenance window
                </h4>
                {windows.slice(0, 1).map((w) => (
                  <div key={w.start}>
                    <div style={{ marginBottom: 6 }}>
                      <span className="badge ok">{w.start} → {w.end}</span>{" "}
                      <span className="small dim">confidence {w.score}/100</span>
                    </div>
                    <ul className="small dim" style={{ margin: 0, paddingLeft: 18 }}>
                      {w.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
