"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Candidate {
  kb: string;
  title: string;
  tier: string;
  score: number;
  affected: number;
}

interface Ring {
  name: string;
  serverIds: string[];
  window: string;
}

interface ExistingPlan {
  id: number;
  name: string;
  status: string;
  created_at: string;
  kbs: string[];
  rings: Ring[];
  rationale: string;
  rationaleModel: string;
}

interface ServerRef {
  id: string;
  name: string;
  role: string;
}

export function PlanBuilder({
  candidates,
  servers,
  existingPlans,
}: {
  candidates: Candidate[];
  servers: ServerRef[];
  existingPlans: ExistingPlan[];
}) {
  const router = useRouter();
  const byId = new Map(servers.map((s) => [s.id, s]));
  const [selected, setSelected] = useState<Set<string>>(
    new Set(candidates.filter((c) => c.tier === "Critical" || c.tier === "High").map((c) => c.kb))
  );
  const [name, setName] = useState(`2026-07 Patch cycle`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(kb: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kb)) next.delete(kb);
      else next.add(kb);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kbs: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Plan creation failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeReport(planId: number) {
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deployment", planId }),
    });
    window.location.href = "/reports";
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>New plan</h3>
        <div style={{ maxWidth: 420, marginBottom: 12 }}>
          <label>Plan name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <label>Patches to deploy (pre-selected: Critical &amp; High)</label>
        {candidates.map((c) => (
          <div className="checkbox-row" key={c.kb}>
            <input
              type="checkbox"
              id={`kb-${c.kb}`}
              checked={selected.has(c.kb)}
              onChange={() => toggle(c.kb)}
            />
            <label htmlFor={`kb-${c.kb}`} style={{ fontWeight: 400, color: "var(--text)", marginBottom: 0 }}>
              <span className="mono" style={{ fontWeight: 600 }}>{c.kb}</span> — {c.title}{" "}
              <span className={`badge ${c.tier.toLowerCase()}`}>{c.tier} · {c.score}</span>{" "}
              <span className="dim small">{c.affected} server{c.affected === 1 ? "" : "s"}</span>
            </label>
          </div>
        ))}
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="primary" onClick={create} disabled={busy || selected.size === 0}>
            {busy ? "Building plan + asking AI…" : "Create plan"}
          </button>
          {error && <span className="small" style={{ color: "var(--critical)" }}>{error}</span>}
        </div>
      </div>

      {existingPlans.map((p) => (
        <div className="card" key={p.id} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15 }}>{p.name}</strong>
            <span className="badge accent">{p.status}</span>
            <span className="dim small">{p.created_at.slice(0, 16).replace("T", " ")}</span>
            <span className="dim small">patches: {p.kbs.join(", ")}</span>
            <span className="spacer" />
            <button onClick={() => makeReport(p.id)}>Generate deployment report</button>
          </div>

          <div className="grid cols-3" style={{ marginTop: 12 }}>
            {p.rings.map((ring, i) => (
              <div key={i} style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Ring {i + 1}: {ring.name}</div>
                <div className="small dim" style={{ marginBottom: 6 }}>Window: {ring.window}</div>
                <div className="small">
                  {ring.serverIds.map((id) => byId.get(id)?.name ?? id).join(", ")}
                </div>
              </div>
            ))}
          </div>

          <div className="callout" style={{ marginTop: 12 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Why this plan looks the way it does</div>
            {p.rationale}
            <div className="small dim" style={{ marginTop: 6 }}>Rationale by {p.rationaleModel}</div>
          </div>
        </div>
      ))}
    </>
  );
}
