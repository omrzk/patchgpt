export interface Server {
  id: string;
  name: string;
  os: string;
  role: string;
  environment: string;
  criticality: number;
  source: string;
  ip: string | null;
  cluster: string | null;
  internet_facing: number;
  business_hours: string;
  uptime_days: number;
  pending_reboot: number;
  services: string; // JSON array
  last_scan: string | null;
}

export interface Patch {
  kb: string;
  title: string;
  classification: string;
  products: string;
  release_date: string;
  description: string;
  requires_reboot: number;
  size_mb: number;
  known_issues: string; // JSON array
  breaking_changes: string; // JSON array
}

export interface Cve {
  id: string;
  cvss: number;
  severity: string;
  exploited: number;
  public_poc: number;
  description: string;
}

export interface PatchPriority {
  kb: string;
  score: number;
  tier: "Critical" | "High" | "Medium" | "Low";
  factors: string[];
  affectedServers: string[]; // server ids missing this patch
  maxCvss: number;
  exploited: boolean;
}

export interface RebootImpact {
  serverId: string;
  requiresReboot: boolean;
  estimatedMinutes: number;
  risk: "low" | "medium" | "high";
  factors: string[];
}

export interface WindowCandidate {
  start: string; // e.g. "Sat 22:00"
  end: string;
  score: number;
  reasons: string[];
}

export interface Explanation {
  summary: string;
  security_fixes: string[];
  breaking_changes: string[];
  known_issues: string[];
  cve_severity: { id: string; cvss: number; severity: string; exploited: boolean; note: string }[];
  business_impact: string;
  recommendation: string;
}
