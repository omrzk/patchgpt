"use client";

import { useEffect, useState } from "react";

interface SettingRow {
  key: string;
  set: boolean;
  value?: string;
}

const GROUPS: { title: string; note: string; fields: { key: string; label: string; secret?: boolean }[] }[] = [
  {
    title: "AI analysis",
    note: "Anthropic API is used first (claude-opus-4-8); OpenRouter is the fallback. Leave both empty for deterministic mode.",
    fields: [
      { key: "anthropic_api_key", label: "Anthropic API key", secret: true },
      { key: "openrouter_api_key", label: "OpenRouter API key", secret: true },
    ],
  },
  {
    title: "Azure Update Manager",
    note: "App registration with Reader on the subscription. Pulls patch assessments from Azure Resource Graph.",
    fields: [
      { key: "azure_tenant_id", label: "Tenant ID" },
      { key: "azure_client_id", label: "Client ID" },
      { key: "azure_client_secret", label: "Client secret", secret: true },
      { key: "azure_subscription_id", label: "Subscription ID" },
    ],
  },
  {
    title: "Configuration Manager (SCCM)",
    note: "AdminService URL, e.g. https://cm01.corp.local/AdminService — account needs Full Administrator.",
    fields: [
      { key: "sccm_adminservice_url", label: "AdminService URL" },
      { key: "sccm_username", label: "Username" },
      { key: "sccm_password", label: "Password", secret: true },
    ],
  },
  {
    title: "Microsoft Intune",
    note: "App registration with DeviceManagementManagedDevices.Read.All (application permission).",
    fields: [
      { key: "intune_tenant_id", label: "Tenant ID" },
      { key: "intune_client_id", label: "Client ID" },
      { key: "intune_client_secret", label: "Client secret", secret: true },
    ],
  },
];

export function SettingsForm() {
  const [rows, setRows] = useState<Record<string, SettingRow>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [aiMode, setAiMode] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    const map: Record<string, SettingRow> = {};
    const vals: Record<string, string> = {};
    for (const s of data.settings as SettingRow[]) {
      map[s.key] = s;
      if (s.value) vals[s.key] = s.value;
    }
    setRows(map);
    setValues(vals);
    setAiMode(data.aiMode);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setValues((prev) => {
        // Clear secret inputs after save; they're stored server-side.
        const next = { ...prev };
        for (const g of GROUPS)
          for (const f of g.fields) if (f.secret) delete next[f.key];
        return next;
      });
      await load();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="callout" style={{ marginBottom: 20 }}>
        AI mode: <strong>{aiMode || "…"}</strong>
        {aiMode === "mock" && " — no key configured; explanations are engine-generated."}
      </div>

      <div className="grid cols-2">
        {GROUPS.map((g) => (
          <div className="card" key={g.title}>
            <h3>{g.title}</h3>
            <p className="small dim" style={{ marginTop: 0 }}>{g.note}</p>
            {g.fields.map((f) => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <label>
                  {f.label}
                  {rows[f.key]?.set && <span className="badge ok" style={{ marginLeft: 8 }}>set</span>}
                </label>
                <input
                  type={f.secret ? "password" : "text"}
                  placeholder={rows[f.key]?.set && f.secret ? "•••••••• (enter to replace)" : ""}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="small" style={{ color: "var(--ok)" }}>Saved.</span>}
      </div>
    </>
  );
}
