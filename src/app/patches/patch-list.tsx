"use client";

import { useState } from "react";
import type { Explanation, Patch, PatchPriority } from "@/lib/types";

interface Row {
  priority: PatchPriority;
  patch: Patch;
  affectedNames: string[];
}

export function PatchList({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, { explanation: Explanation; model: string }>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function explain(kb: string) {
    setError(null);
    if (open === kb) {
      setOpen(null);
      return;
    }
    setOpen(kb);
    if (explanations[kb]) return;
    setLoading(kb);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kb }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Explain failed");
      setExplanations((prev) => ({ ...prev, [kb]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {error && <div className="callout warn">{error}</div>}
      {rows.map(({ priority, patch, affectedNames }) => {
        const exp = explanations[patch.kb];
        const isOpen = open === patch.kb;
        return (
          <div className="card" key={patch.kb} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontWeight: 700 }}>{patch.kb}</span>
              <strong>{patch.title}</strong>
              <span className={`badge ${priority.tier.toLowerCase()}`}>
                {priority.tier} · {priority.score}/100
              </span>
              {priority.exploited && <span className="badge critical">actively exploited</span>}
              {patch.requires_reboot === 1 && <span className="badge low">reboot required</span>}
              <span className="spacer" />
              <button onClick={() => explain(patch.kb)}>
                {isOpen ? "Hide" : loading === patch.kb ? "Analyzing…" : "Explain"}
              </button>
            </div>
            <div className="small dim" style={{ marginTop: 6 }}>
              {patch.classification} · {patch.products} · released {patch.release_date} ·{" "}
              {patch.size_mb.toFixed(0)} MB ·{" "}
              {affectedNames.length
                ? `missing on ${affectedNames.join(", ")}`
                : "installed everywhere"}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              {priority.factors.map((f, i) => (
                <span key={i} className="dim">
                  {i > 0 && " · "}
                  {f}
                </span>
              ))}
            </div>

            {isOpen && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                {loading === patch.kb && <div className="dim">Asking the AI to analyze this patch…</div>}
                {exp && <ExplanationView explanation={exp.explanation} model={exp.model} />}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ExplanationView({ explanation, model }: { explanation: Explanation; model: string }) {
  return (
    <>
      <div className="callout">{explanation.summary}</div>

      <div className="grid cols-2">
        <div>
          <div className="explain-section">
            <h4>Security fixes</h4>
            <ul>
              {explanation.security_fixes.length
                ? explanation.security_fixes.map((s, i) => <li key={i}>{s}</li>)
                : <li className="dim">No security fixes — maintenance/quality update.</li>}
            </ul>
          </div>
          <div className="explain-section">
            <h4>CVE severity</h4>
            <ul>
              {explanation.cve_severity.length
                ? explanation.cve_severity.map((c) => (
                    <li key={c.id}>
                      <span className="mono">{c.id}</span> — CVSS {c.cvss.toFixed(1)} ({c.severity})
                      {c.exploited && <span className="badge critical" style={{ marginLeft: 6 }}>exploited</span>}
                      <div className="small dim">{c.note}</div>
                    </li>
                  ))
                : <li className="dim">No CVEs tracked for this update.</li>}
            </ul>
          </div>
        </div>
        <div>
          <div className="explain-section">
            <h4>Breaking changes</h4>
            <ul>
              {explanation.breaking_changes.length
                ? explanation.breaking_changes.map((s, i) => <li key={i}>{s}</li>)
                : <li className="dim">None documented.</li>}
            </ul>
          </div>
          <div className="explain-section">
            <h4>Known issues</h4>
            <ul>
              {explanation.known_issues.length
                ? explanation.known_issues.map((s, i) => <li key={i}>{s}</li>)
                : <li className="dim">None documented.</li>}
            </ul>
          </div>
          <div className="explain-section">
            <h4>Business impact</h4>
            <p style={{ margin: 0 }}>{explanation.business_impact}</p>
          </div>
        </div>
      </div>

      <div className="explain-section" style={{ marginTop: 4 }}>
        <h4>Recommendation</h4>
        <p style={{ margin: 0 }}>{explanation.recommendation}</p>
      </div>
      <div className="small dim">Analysis by {model}</div>
    </>
  );
}
