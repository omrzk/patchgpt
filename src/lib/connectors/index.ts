import { getDb, getSetting } from "../db";
import { AzureUpdateManagerConnector } from "./azureUpdateManager";
import { SccmConnector } from "./sccm";
import { IntuneConnector } from "./intune";
import type { Connector, ConnectorResult, DiscoveredServer } from "./base";

export const CONNECTORS: Record<string, () => Connector> = {
  azure: () => new AzureUpdateManagerConnector(),
  sccm: () => new SccmConnector(),
  intune: () => new IntuneConnector(),
};

export function connectorStatus() {
  return Object.entries(CONNECTORS).map(([id, make]) => {
    const c = make();
    return { id, name: c.name, configured: c.isConfigured(), description: c.description };
  });
}

/**
 * Run a scan. Configured connectors pull real inventory; otherwise we run a
 * simulated agent scan against the demo fleet (refresh timestamps, re-detect
 * missing patches) so the workflow is fully demonstrable without credentials.
 */
export async function runScan(source: string): Promise<ConnectorResult> {
  const db = getDb();
  const now = new Date().toISOString();

  if (source !== "demo") {
    const make = CONNECTORS[source];
    if (!make) throw new Error(`Unknown connector: ${source}`);
    const connector = make();
    if (!connector.isConfigured()) {
      throw new Error(`${connector.name} is not configured. Add credentials in Settings, or run a demo scan.`);
    }
    const servers = await connector.fetchServers();
    upsertServers(servers, source);
    return {
      source,
      serversScanned: servers.length,
      missingDetected: servers.reduce((n, s) => n + s.missingKbs.length, 0),
      scannedAt: now,
      simulated: false,
    };
  }

  // Demo scan: touch every demo server and recount missing patches.
  db.prepare("UPDATE servers SET last_scan = ? WHERE source = 'demo'").run(now);
  const missing = db
    .prepare(
      `SELECT COUNT(*) AS n FROM server_patches sp JOIN servers s ON s.id = sp.server_id
       WHERE sp.status = 'missing' AND s.source = 'demo'`
    )
    .get() as { n: number };
  const servers = db.prepare("SELECT COUNT(*) AS n FROM servers WHERE source = 'demo'").get() as { n: number };
  return {
    source: "demo",
    serversScanned: servers.n,
    missingDetected: missing.n,
    scannedAt: now,
    simulated: true,
  };
}

function upsertServers(servers: DiscoveredServer[], source: string) {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO servers (id, name, os, role, environment, criticality, ip, internet_facing, business_hours, uptime_days, pending_reboot, services, source, last_scan)
     VALUES (@id, @name, @os, @role, 'production', 3, @ip, 0, '08:00-18:00 Mon-Fri', 0, @pendingReboot, '[]', @source, @now)
     ON CONFLICT(id) DO UPDATE SET name = @name, os = @os, ip = @ip, pending_reboot = @pendingReboot, last_scan = @now`
  );
  const upsertPatch = db.prepare(
    `INSERT INTO patches (kb, title, classification, products, release_date, description)
     VALUES (@kb, @title, @classification, @products, @releaseDate, '')
     ON CONFLICT(kb) DO NOTHING`
  );
  const upsertSp = db.prepare(
    `INSERT INTO server_patches (server_id, kb, status, detected_at)
     VALUES (?, ?, 'missing', ?)
     ON CONFLICT(server_id, kb) DO UPDATE SET status = 'missing', detected_at = excluded.detected_at`
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const s of servers) {
      upsert.run({ id: s.id, name: s.name, os: s.os, role: s.role ?? "Server", ip: s.ip ?? null, pendingReboot: s.pendingReboot ? 1 : 0, source, now });
      for (const m of s.missingKbs) {
        upsertPatch.run({
          kb: m.kb,
          title: m.title ?? m.kb,
          classification: m.classification ?? "Security Update",
          products: s.os,
          releaseDate: m.releaseDate ?? now.slice(0, 10),
        });
        upsertSp.run(s.id, m.kb, now);
      }
    }
  });
  tx();
}

export { getSetting };
