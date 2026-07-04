"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ConnectorInfo {
  id: string;
  name: string;
  configured: boolean;
}

export function ScanButton() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [source, setSource] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scan")
      .then((r) => r.json())
      .then((d) => setConnectors(d.connectors ?? []));
  }, []);

  async function scan() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(
        `${data.simulated ? "Simulated scan" : "Scan"} complete: ${data.serversScanned} servers, ${data.missingDetected} missing updates detected.`
      );
      router.refresh();
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <select value={source} onChange={(e) => setSource(e.target.value)} style={{ width: 300 }}>
        <option value="demo">Agentless demo scan (simulated fleet)</option>
        {connectors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.configured ? "" : "(not configured)"}
          </option>
        ))}
      </select>
      <button className="primary" onClick={scan} disabled={busy}>
        {busy ? "Scanning…" : "Scan now"}
      </button>
      {result && <span className="small dim">{result}</span>}
    </>
  );
}
