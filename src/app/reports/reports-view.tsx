"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReportMeta {
  id: number;
  type: string;
  title: string;
  created_at: string;
}

export function ReportsView({ reports }: { reports: ReportMeta[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [content, setContent] = useState<string>("");

  async function generateCompliance() {
    setBusy(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "compliance" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function view(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const res = await fetch(`/api/reports/${id}`);
    const data = await res.json();
    setContent(data.report?.content ?? "");
    setOpenId(id);
  }

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={generateCompliance} disabled={busy}>
          {busy ? "Generating…" : "Generate compliance report"}
        </button>
        <span className="small dim">
          Deployment reports are generated from the Deployment Plans page.
        </span>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Report</th>
              <th>Type</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="dim">No reports yet.</td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td><span className="badge accent">{r.type}</span></td>
                <td className="dim">{r.created_at.slice(0, 16).replace("T", " ")}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button onClick={() => view(r.id)} style={{ marginRight: 8 }}>
                    {openId === r.id ? "Hide" : "View"}
                  </button>
                  <a className="btn" href={`/api/reports/${r.id}?download=1`}>Download .md</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId !== null && (
        <div className="report-body" style={{ marginTop: 16 }}>{content}</div>
      )}
    </>
  );
}
