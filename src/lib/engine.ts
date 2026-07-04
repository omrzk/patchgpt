import { getDb } from "./db";
import type { Cve, Patch, PatchPriority, RebootImpact, Server, WindowCandidate } from "./types";

export function getCvesForPatch(kb: string): Cve[] {
  return getDb()
    .prepare(
      `SELECT c.* FROM cves c JOIN patch_cves pc ON pc.cve_id = c.id WHERE pc.kb = ? ORDER BY c.cvss DESC`
    )
    .all(kb) as Cve[];
}

export function getServersMissing(kb: string): Server[] {
  return getDb()
    .prepare(
      `SELECT s.* FROM servers s JOIN server_patches sp ON sp.server_id = s.id
       WHERE sp.kb = ? AND sp.status = 'missing' ORDER BY s.criticality DESC`
    )
    .all(kb) as Server[];
}

/**
 * Deterministic priority score (0-100). The AI explains it; it never invents it.
 * Weights: CVSS dominates, exploitation and exposure escalate, criticality and
 * patch age fill in the rest.
 */
export function scorePatch(patch: Patch): PatchPriority {
  const cves = getCvesForPatch(patch.kb);
  const affected = getServersMissing(patch.kb);
  const factors: string[] = [];

  const maxCvss = cves.reduce((m, c) => Math.max(m, c.cvss), 0);
  const exploited = cves.some((c) => c.exploited === 1);
  const poc = cves.some((c) => c.public_poc === 1 && c.exploited === 0);
  const internetFacing = affected.some((s) => s.internet_facing === 1);
  const maxCrit = affected.reduce((m, s) => Math.max(m, s.criticality), 0);
  const ageDays = Math.max(0, (Date.now() - new Date(patch.release_date).getTime()) / 86400000);

  let score = maxCvss * 6.2; // up to 62
  if (maxCvss > 0) factors.push(`Highest CVSS ${maxCvss.toFixed(1)} across ${cves.length} CVE${cves.length === 1 ? "" : "s"}`);

  if (exploited) {
    score += 14;
    factors.push("At least one CVE is being actively exploited in the wild");
  } else if (poc) {
    score += 7;
    factors.push("Public proof-of-concept exploit code exists");
  }
  if (internetFacing) {
    score += 7;
    factors.push("Missing on internet-facing servers (direct exposure)");
  }
  score += maxCrit * 1.4; // up to 7
  if (maxCrit >= 4) factors.push(`Affects business-critical servers (criticality ${maxCrit}/5)`);
  const ageBoost = Math.min(ageDays / 10, 5);
  score += ageBoost;
  if (ageDays > 21) factors.push(`Patch has been available ${Math.round(ageDays)} days — exposure window is growing`);
  if (affected.length === 0) {
    score = Math.min(score, 10);
    factors.push("No servers currently missing this patch");
  }

  score = Math.min(100, Math.round(score));
  const tier = score >= 85 ? "Critical" : score >= 65 ? "High" : score >= 40 ? "Medium" : "Low";
  return {
    kb: patch.kb,
    score,
    tier,
    factors,
    affectedServers: affected.map((s) => s.id),
    maxCvss,
    exploited,
  };
}

export function getAllPriorities(): PatchPriority[] {
  const patches = getDb().prepare("SELECT * FROM patches").all() as Patch[];
  return patches.map(scorePatch).sort((a, b) => b.score - a.score);
}

/** Predict reboot impact for a server from its missing patches + reboot history. */
export function predictReboot(server: Server): RebootImpact {
  const db = getDb();
  const missing = db
    .prepare(
      `SELECT p.* FROM patches p JOIN server_patches sp ON sp.kb = p.kb
       WHERE sp.server_id = ? AND sp.status = 'missing'`
    )
    .all(server.id) as Patch[];
  const durations = db
    .prepare("SELECT duration_seconds FROM reboot_history WHERE server_id = ? ORDER BY duration_seconds")
    .all(server.id) as { duration_seconds: number }[];

  const requiresReboot = missing.some((p) => p.requires_reboot === 1);
  const factors: string[] = [];

  // Median historical reboot time, defaulting to 6 min when no history.
  const median = durations.length
    ? durations[Math.floor(durations.length / 2)].duration_seconds
    : 360;
  factors.push(
    durations.length
      ? `Median of ${durations.length} historical reboots: ${Math.round(median / 60)} min`
      : "No reboot history — using 6 min default"
  );

  // Install time scales with payload size (~2 min per 100 MB offline servicing).
  const totalMb = missing.reduce((s, p) => s + p.size_mb, 0);
  const installMin = Math.ceil((totalMb / 100) * 2);
  if (totalMb > 0) factors.push(`${Math.round(totalMb)} MB of updates ≈ ${installMin} min offline servicing`);

  let riskPoints = 0;
  if (server.pending_reboot === 1) {
    riskPoints += 2;
    factors.push("Server already has a pending reboot — stacked servicing operations raise failure risk");
  }
  if (server.uptime_days > 90) {
    riskPoints += 1;
    factors.push(`Uptime of ${server.uptime_days} days — long-running state increases post-reboot service failure risk`);
  }
  if (server.cluster) {
    factors.push(`Cluster member (${server.cluster}) — requires drain/failover before reboot, but enables zero-downtime patching`);
  }
  if (server.role === "Domain Controller") {
    riskPoints += 1;
    factors.push("Domain Controller — reboot affects authentication; ensure the peer DC is healthy first");
  }
  if (server.role === "Exchange Server") {
    riskPoints += 1;
    factors.push("Exchange — services take several extra minutes to fully resume after boot");
  }

  const estimatedMinutes = Math.round(median / 60) + installMin + (requiresReboot ? 2 : 0);
  const risk = riskPoints >= 3 ? "high" : riskPoints >= 1 ? "medium" : "low";
  return { serverId: server.id, requiresReboot, estimatedMinutes, risk, factors };
}

/** Recommend maintenance windows for a server based on business hours + cluster role. */
export function recommendWindows(server: Server): WindowCandidate[] {
  const candidates: WindowCandidate[] = [];
  const impact = predictReboot(server);
  const bh = server.business_hours;

  if (bh === "24x7") {
    if (server.cluster) {
      candidates.push({
        start: "Sat 22:00",
        end: "Sun 02:00",
        score: 95,
        reasons: [
          "24x7 workload, but cluster membership allows rolling patching with no user-visible downtime",
          "Weekend late-night window minimizes load during node drain/failover",
          `Estimated per-node outage ${impact.estimatedMinutes} min is absorbed by the surviving node`,
        ],
      });
      candidates.push({
        start: "Wed 23:00",
        end: "Thu 01:00",
        score: 72,
        reasons: [
          "Mid-week fallback window if the weekend slot is consumed by the other cluster node",
          "Keeps the two nodes on separate nights so the cluster never loses quorum",
        ],
      });
    } else {
      candidates.push({
        start: "Sun 02:00",
        end: "Sun 05:00",
        score: 88,
        reasons: [
          "Standalone 24x7 server — lowest observed business activity window",
          `Full outage of ~${impact.estimatedMinutes} min must be announced; no failover partner exists`,
        ],
      });
      candidates.push({
        start: "Sat 23:00",
        end: "Sun 01:00",
        score: 70,
        reasons: ["Alternative weekend slot; slightly higher residual activity than early Sunday"],
      });
    }
  } else {
    // Off-hours for business-hours servers: evening after close.
    const closes = bh.match(/-(\d{2}):/);
    const closeHour = closes ? parseInt(closes[1], 10) : 18;
    const start = `${String(closeHour + 1).padStart(2, "0")}:00`;
    candidates.push({
      start: `Weekday ${start}`,
      end: `Weekday ${String((closeHour + 4) % 24).padStart(2, "0")}:00`,
      score: 90,
      reasons: [
        `Business hours are ${bh} — patching after close affects no users`,
        `~${impact.estimatedMinutes} min estimated outage fits comfortably in a 3-hour window`,
      ],
    });
    candidates.push({
      start: "Sat 10:00",
      end: "Sat 14:00",
      score: 75,
      reasons: ["Weekend daytime alternative with staff available for verification"],
    });
  }
  return candidates;
}

export interface DashboardStats {
  totalServers: number;
  compliantServers: number;
  compliancePct: number;
  missingBySeverity: { tier: string; count: number }[];
  exploitedExposure: number;
  pendingReboots: number;
  topRisks: { server: Server; missingCount: number; worstTier: string; worstScore: number }[];
  patchAging: { kb: string; title: string; days: number; tier: string }[];
  envCompliance: { environment: string; total: number; compliant: number }[];
}

export function getDashboard(): DashboardStats {
  const db = getDb();
  const servers = db.prepare("SELECT * FROM servers").all() as Server[];
  const priorities = getAllPriorities();
  const prioByKb = new Map(priorities.map((p) => [p.kb, p]));

  const missingRows = db
    .prepare("SELECT server_id, kb FROM server_patches WHERE status = 'missing'")
    .all() as { server_id: string; kb: string }[];
  const missingByServer = new Map<string, string[]>();
  for (const r of missingRows) {
    const arr = missingByServer.get(r.server_id) ?? [];
    arr.push(r.kb);
    missingByServer.set(r.server_id, arr);
  }

  const compliantServers = servers.filter((s) => !(missingByServer.get(s.id)?.length)).length;

  const tierCounts = new Map<string, number>();
  for (const r of missingRows) {
    const tier = prioByKb.get(r.kb)?.tier ?? "Low";
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  }

  const exploitedExposure = new Set(
    missingRows.filter((r) => prioByKb.get(r.kb)?.exploited).map((r) => r.server_id)
  ).size;

  const tierRank = { Critical: 4, High: 3, Medium: 2, Low: 1 } as Record<string, number>;
  const topRisks = servers
    .map((s) => {
      const kbs = missingByServer.get(s.id) ?? [];
      let worstTier = "Low";
      let worstScore = 0;
      for (const kb of kbs) {
        const p = prioByKb.get(kb);
        if (p && p.score > worstScore) {
          worstScore = p.score;
          worstTier = p.tier;
        }
      }
      return { server: s, missingCount: kbs.length, worstTier, worstScore };
    })
    .filter((r) => r.missingCount > 0)
    .sort((a, b) => b.worstScore - a.worstScore || b.missingCount - a.missingCount)
    .slice(0, 6);

  const patches = db.prepare("SELECT * FROM patches").all() as Patch[];
  const patchAging = patches
    .filter((p) => priorities.find((x) => x.kb === p.kb && x.affectedServers.length > 0))
    .map((p) => ({
      kb: p.kb,
      title: p.title,
      days: Math.round((Date.now() - new Date(p.release_date).getTime()) / 86400000),
      tier: prioByKb.get(p.kb)?.tier ?? "Low",
    }))
    .sort((a, b) => b.days - a.days);

  const envs = [...new Set(servers.map((s) => s.environment))];
  const envCompliance = envs.map((environment) => {
    const es = servers.filter((s) => s.environment === environment);
    return {
      environment,
      total: es.length,
      compliant: es.filter((s) => !(missingByServer.get(s.id)?.length)).length,
    };
  });

  return {
    totalServers: servers.length,
    compliantServers,
    compliancePct: Math.round((compliantServers / Math.max(1, servers.length)) * 100),
    missingBySeverity: ["Critical", "High", "Medium", "Low"]
      .map((tier) => ({ tier, count: tierCounts.get(tier) ?? 0 })),
    exploitedExposure,
    pendingReboots: servers.filter((s) => s.pending_reboot === 1).length,
    topRisks,
    patchAging,
    envCompliance,
  };
}
