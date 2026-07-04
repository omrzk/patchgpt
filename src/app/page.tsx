import Link from "next/link";
import { getDashboard } from "@/lib/engine";

export const dynamic = "force-dynamic";

const TIER_COLOR: Record<string, string> = {
  Critical: "var(--critical)",
  High: "var(--high)",
  Medium: "var(--medium)",
  Low: "var(--low)",
};

export default function DashboardPage() {
  const dash = getDashboard();
  const maxCount = Math.max(1, ...dash.missingBySeverity.map((m) => m.count));

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        Fleet posture at a glance. Every number below is computed from the last scan; open a patch
        for the AI explanation behind it.
      </p>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="kpi-label">Fleet compliance</div>
          <div className={`kpi-value ${dash.compliancePct >= 80 ? "good" : dash.compliancePct >= 50 ? "warn" : "bad"}`}>
            {dash.compliancePct}%
          </div>
          <div className="kpi-note">
            {dash.compliantServers} of {dash.totalServers} servers fully patched
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Exploited-CVE exposure</div>
          <div className={`kpi-value ${dash.exploitedExposure > 0 ? "bad" : "good"}`}>
            {dash.exploitedExposure}
          </div>
          <div className="kpi-note">servers missing a patch for an actively exploited CVE</div>
        </div>
        <div className="card">
          <div className="kpi-label">Missing updates</div>
          <div className="kpi-value">
            {dash.missingBySeverity.reduce((s, m) => s + m.count, 0)}
          </div>
          <div className="kpi-note">
            {dash.missingBySeverity.find((m) => m.tier === "Critical")?.count ?? 0} critical ·{" "}
            {dash.missingBySeverity.find((m) => m.tier === "High")?.count ?? 0} high
          </div>
        </div>
        <div className="card">
          <div className="kpi-label">Pending reboots</div>
          <div className={`kpi-value ${dash.pendingReboots > 0 ? "warn" : "good"}`}>
            {dash.pendingReboots}
          </div>
          <div className="kpi-note">servers awaiting restart before new servicing</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Missing updates by priority tier</h3>
          {dash.missingBySeverity.map((m) => (
            <div className="bar-row" key={m.tier}>
              <div className="bar-label" style={{ color: TIER_COLOR[m.tier] }}>{m.tier}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(m.count / maxCount) * 100}%`, background: TIER_COLOR[m.tier] }}
                />
              </div>
              <div className="bar-count">{m.count}</div>
            </div>
          ))}
          <p className="small dim" style={{ marginBottom: 0 }}>
            Tiers come from the priority engine: CVSS, active exploitation, internet exposure,
            server criticality, and patch age. The <Link href="/patches">Patches</Link> view shows
            the factors behind each score.
          </p>
        </div>

        <div className="card">
          <h3>Environment compliance</h3>
          {dash.envCompliance.map((e) => {
            const pct = Math.round((e.compliant / Math.max(1, e.total)) * 100);
            return (
              <div className="bar-row" key={e.environment}>
                <div className="bar-label" style={{ width: 90, textTransform: "capitalize" }}>{e.environment}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${pct}%`, background: pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--medium)" : "var(--critical)" }}
                  />
                </div>
                <div className="bar-count" style={{ width: 78 }}>{e.compliant}/{e.total}</div>
              </div>
            );
          })}
          <h3 style={{ marginTop: 20 }}>Patch aging (still missing somewhere)</h3>
          {dash.patchAging.slice(0, 5).map((p) => (
            <div className="bar-row" key={p.kb}>
              <div className="bar-label mono" style={{ width: 90 }}>{p.kb}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, (p.days / 60) * 100)}%`,
                    background: TIER_COLOR[p.tier],
                  }}
                />
              </div>
              <div className="bar-count" style={{ width: 58 }}>{p.days}d</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Highest-risk servers</h3>
        <table>
          <thead>
            <tr>
              <th>Server</th>
              <th>Role</th>
              <th>Environment</th>
              <th>Criticality</th>
              <th>Missing updates</th>
              <th>Worst missing patch</th>
            </tr>
          </thead>
          <tbody>
            {dash.topRisks.map((r) => (
              <tr key={r.server.id}>
                <td>
                  <Link href="/servers">{r.server.name}</Link>
                  {r.server.internet_facing === 1 && (
                    <span className="badge accent" style={{ marginLeft: 8 }}>internet-facing</span>
                  )}
                </td>
                <td>{r.server.role}</td>
                <td style={{ textTransform: "capitalize" }}>{r.server.environment}</td>
                <td>{r.server.criticality}/5</td>
                <td>{r.missingCount}</td>
                <td>
                  <span className={`badge ${r.worstTier.toLowerCase()}`}>
                    {r.worstTier} · {r.worstScore}/100
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
