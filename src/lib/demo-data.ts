import type Database from "better-sqlite3";

// Fictional demo environment: "Helios Dynamics", a mid-size manufacturer.
// All KB numbers, CVE IDs, and servers are simulated for demonstration.

const SERVERS = [
  ["srv-dc01", "HD-DC01", "Windows Server 2022", "Domain Controller", "production", 5, "10.10.1.10", null, 0, "24x7", 112, 0, ["NTDS", "DNS", "KDC"]],
  ["srv-dc02", "HD-DC02", "Windows Server 2022", "Domain Controller", "production", 5, "10.10.1.11", null, 0, "24x7", 47, 0, ["NTDS", "DNS", "KDC"]],
  ["srv-sql01a", "HD-SQL01A", "Windows Server 2022", "SQL Server", "production", 5, "10.10.2.20", "SQLCLUS01", 0, "24x7", 88, 0, ["MSSQLSERVER", "SQLAgent"]],
  ["srv-sql01b", "HD-SQL01B", "Windows Server 2022", "SQL Server", "production", 5, "10.10.2.21", "SQLCLUS01", 0, "24x7", 88, 1, ["MSSQLSERVER", "SQLAgent"]],
  ["srv-web01", "HD-WEB01", "Windows Server 2022", "IIS Web Server", "production", 4, "10.10.3.30", "WEBFARM", 1, "24x7", 133, 0, ["W3SVC", "WAS"]],
  ["srv-web02", "HD-WEB02", "Windows Server 2022", "IIS Web Server", "production", 4, "10.10.3.31", "WEBFARM", 1, "24x7", 61, 0, ["W3SVC", "WAS"]],
  ["srv-exch01", "HD-EXCH01", "Windows Server 2019", "Exchange Server", "production", 5, "10.10.4.40", null, 1, "24x7", 156, 1, ["MSExchangeIS", "MSExchangeTransport", "W3SVC"]],
  ["srv-rds01", "HD-RDS01", "Windows Server 2019", "Remote Desktop", "production", 3, "10.10.5.50", "RDSFARM", 1, "06:00-22:00 Mon-Sat", 74, 0, ["TermService", "TSGateway"]],
  ["srv-rds02", "HD-RDS02", "Windows Server 2019", "Remote Desktop", "production", 3, "10.10.5.51", "RDSFARM", 0, "06:00-22:00 Mon-Sat", 74, 0, ["TermService"]],
  ["srv-file01", "HD-FILE01", "Windows Server 2022", "File Server", "production", 3, "10.10.6.60", null, 0, "07:00-19:00 Mon-Fri", 29, 0, ["LanmanServer", "DFSR"]],
  ["srv-hv01", "HD-HV01", "Windows Server 2022", "Hyper-V Host", "production", 5, "10.10.7.70", "HVCLUS01", 0, "24x7", 121, 0, ["vmms", "vmcompute"]],
  ["srv-hv02", "HD-HV02", "Windows Server 2022", "Hyper-V Host", "production", 5, "10.10.7.71", "HVCLUS01", 0, "24x7", 95, 0, ["vmms", "vmcompute"]],
  ["srv-app01", "HD-APP01", "Windows Server 2019", "Application Server", "staging", 2, "10.20.1.15", null, 0, "08:00-18:00 Mon-Fri", 33, 0, ["HeliosMES"]],
  ["srv-print01", "HD-PRINT01", "Windows Server 2019", "Print Server", "production", 1, "10.10.8.80", null, 0, "07:00-19:00 Mon-Fri", 201, 0, ["Spooler"]],
] as const;

const CVES = [
  ["CVE-2026-30412", 9.8, "Critical", 1, 1, "Remote code execution in Windows Routing and Remote Access Service (RRAS) via crafted packets. Actively exploited in the wild."],
  ["CVE-2026-30455", 7.8, "Important", 1, 1, "Win32k elevation of privilege allowing SYSTEM-level code execution from a standard user session. Exploitation detected."],
  ["CVE-2026-30467", 6.5, "Important", 0, 0, "SMB server information disclosure exposing kernel memory fragments to authenticated attackers."],
  ["CVE-2026-30470", 8.1, "Important", 0, 1, "Kerberos KDC elevation of privilege enabling ticket forgery under specific delegation configurations. Public proof-of-concept available."],
  ["CVE-2026-31199", 9.8, "Critical", 1, 1, "Exchange Server remote code execution via deserialization in the PowerShell backend. Actively exploited; CISA KEV-listed."],
  ["CVE-2026-31201", 8.0, "Important", 0, 0, "Exchange Server spoofing vulnerability enabling NTLM relay from Outlook clients."],
  ["CVE-2026-29988", 8.8, "Important", 0, 0, "SQL Server remote code execution through a crafted connection using a vulnerable OLE DB provider path."],
  ["CVE-2026-30089", 7.3, "Important", 0, 0, ".NET Framework elevation of privilege in the CLR loader when processing untrusted assemblies."],
  ["CVE-2026-30521", 9.9, "Critical", 0, 1, "Hyper-V guest-to-host escape via vSMB request handling, allowing code execution on the host from a guest VM. Public proof-of-concept available."],
  ["CVE-2026-30601", 8.1, "Important", 1, 0, "RD Gateway remote code execution via crafted UDP transport requests. Exploitation observed against internet-exposed gateways."],
  ["CVE-2026-28870", 7.5, "Important", 1, 1, "Windows DNS server denial of service / potential RCE chain. Included in earlier 2026-05 cumulative update."],
] as const;

const PATCHES: [string, string, string, string, string, string, number, number, string[], string[]][] = [
  [
    "KB5062070",
    "2026-06 Cumulative Update for Windows Server 2022",
    "Security Update",
    "Windows Server 2022",
    "2026-06-09",
    "Monthly cumulative update addressing 61 vulnerabilities including an actively exploited RRAS remote code execution and a Win32k elevation of privilege.",
    1,
    721.4,
    [
      "Network Policy Server (NPS) may reject RADIUS authentications using PEAP after installation when TLS 1.3 is negotiated; Microsoft-documented workaround is to re-enable TLS 1.2 for NPS.",
      "Some VPN connections using WPA3 credentials may require reconnection after reboot.",
    ],
    [
      "TLS 1.0/1.1 for LDAPS bindings is disabled by default after this update; legacy appliances binding over LDAPS may fail to authenticate.",
    ],
  ],
  [
    "KB5062071",
    "2026-06 Cumulative Update for Windows Server 2019",
    "Security Update",
    "Windows Server 2019",
    "2026-06-09",
    "Monthly cumulative update addressing 57 vulnerabilities including the RRAS remote code execution and a Kerberos elevation of privilege with public proof-of-concept.",
    1,
    634.8,
    [
      "Print jobs to certain Type 4 print drivers may fail after installation; affected environments should install the 2026-06 out-of-band print fix.",
    ],
    [],
  ],
  [
    "KB5062412",
    "Security Update for Exchange Server 2019 CU14 (June 2026 SU)",
    "Security Update",
    "Exchange Server 2019",
    "2026-06-09",
    "Exchange Server security update fixing an actively exploited deserialization remote code execution in the PowerShell backend and an NTLM-relay spoofing vulnerability.",
    1,
    248.0,
    [
      "OWA add-ins relying on legacy serialization may fail to load until re-registered.",
    ],
    [
      "Blocks unsigned serialized PowerShell payloads by default; custom EWS/PowerShell automation using legacy serialization will be rejected after installation.",
    ],
  ],
  [
    "KB5062560",
    "Security Update for SQL Server 2022 (GDR)",
    "Security Update",
    "SQL Server 2022",
    "2026-06-09",
    "SQL Server GDR update addressing a remote code execution reachable through a vulnerable OLE DB provider path.",
    1,
    197.2,
    [],
    [
      "Connections negotiating TLS 1.0 are refused after installation; legacy JDBC 6.x clients must be upgraded or explicitly configured for TLS 1.2.",
    ],
  ],
  [
    "KB5061990",
    "2026-06 .NET Framework 4.8.1 Security and Quality Rollup",
    "Security Update",
    "Windows Server 2019, Windows Server 2022",
    "2026-06-09",
    ".NET Framework rollup fixing a CLR loader elevation of privilege and several reliability issues in WPF and WCF.",
    1,
    86.5,
    [],
    [],
  ],
  [
    "KB5061745",
    "Security Update for Hyper-V (June 2026)",
    "Security Update",
    "Windows Server 2022",
    "2026-06-09",
    "Targeted Hyper-V security update fixing a guest-to-host escape in vSMB request handling. Public proof-of-concept exists; patching hosts running multi-tenant or untrusted workloads is urgent.",
    1,
    92.3,
    [
      "Live migrations between patched and unpatched hosts in the same cluster may pause briefly during the compatibility renegotiation.",
    ],
    [],
  ],
  [
    "KB5062333",
    "Security Update for Remote Desktop Gateway (June 2026)",
    "Security Update",
    "Windows Server 2019",
    "2026-06-09",
    "Fixes a remote code execution in RD Gateway UDP transport handling. Exploitation observed against internet-exposed gateways.",
    1,
    45.1,
    [],
    [],
  ],
  [
    "KB5061566",
    "Update for Microsoft Defender Antimalware Platform",
    "Definition Update",
    "Windows Server 2019, Windows Server 2022",
    "2026-06-17",
    "Defender platform update improving detection engine and fixing a local bypass of tamper protection.",
    0,
    2.1,
    [],
    [],
  ],
  [
    "KB5062100",
    "Servicing Stack Update for Windows Server 2022",
    "Servicing Stack Update",
    "Windows Server 2022",
    "2026-06-09",
    "Servicing stack reliability update; prerequisite for installing the 2026-06 cumulative update.",
    0,
    14.8,
    [],
    [],
  ],
  [
    "KB5060998",
    "2026-05 Cumulative Update for Windows Server 2019",
    "Security Update",
    "Windows Server 2019",
    "2026-05-12",
    "Prior-month cumulative update including a DNS server denial-of-service fix that saw active exploitation.",
    1,
    612.0,
    [],
    [],
  ],
];

const PATCH_CVES: [string, string][] = [
  ["KB5062070", "CVE-2026-30412"],
  ["KB5062070", "CVE-2026-30455"],
  ["KB5062070", "CVE-2026-30467"],
  ["KB5062071", "CVE-2026-30412"],
  ["KB5062071", "CVE-2026-30455"],
  ["KB5062071", "CVE-2026-30470"],
  ["KB5062412", "CVE-2026-31199"],
  ["KB5062412", "CVE-2026-31201"],
  ["KB5062560", "CVE-2026-29988"],
  ["KB5061990", "CVE-2026-30089"],
  ["KB5061745", "CVE-2026-30521"],
  ["KB5062333", "CVE-2026-30601"],
  ["KB5060998", "CVE-2026-28870"],
];

// [server, kb, status]
const SERVER_PATCHES: [string, string, string][] = [
  ["srv-dc01", "KB5062070", "missing"],
  ["srv-dc01", "KB5062100", "missing"],
  ["srv-dc01", "KB5061566", "installed"],
  ["srv-dc02", "KB5062070", "missing"],
  ["srv-dc02", "KB5062100", "installed"],
  ["srv-dc02", "KB5061566", "installed"],
  ["srv-sql01a", "KB5062070", "missing"],
  ["srv-sql01a", "KB5062560", "missing"],
  ["srv-sql01a", "KB5062100", "installed"],
  ["srv-sql01b", "KB5062070", "missing"],
  ["srv-sql01b", "KB5062560", "missing"],
  ["srv-sql01b", "KB5061566", "missing"],
  ["srv-web01", "KB5062070", "missing"],
  ["srv-web01", "KB5061990", "missing"],
  ["srv-web01", "KB5061566", "installed"],
  ["srv-web02", "KB5062070", "missing"],
  ["srv-web02", "KB5061990", "installed"],
  ["srv-exch01", "KB5062412", "missing"],
  ["srv-exch01", "KB5062071", "missing"],
  ["srv-exch01", "KB5060998", "missing"],
  ["srv-exch01", "KB5061990", "missing"],
  ["srv-rds01", "KB5062333", "missing"],
  ["srv-rds01", "KB5062071", "missing"],
  ["srv-rds02", "KB5062333", "missing"],
  ["srv-rds02", "KB5062071", "installed"],
  ["srv-file01", "KB5062070", "installed"],
  ["srv-file01", "KB5062100", "installed"],
  ["srv-file01", "KB5061566", "installed"],
  ["srv-hv01", "KB5061745", "missing"],
  ["srv-hv01", "KB5062070", "missing"],
  ["srv-hv02", "KB5061745", "missing"],
  ["srv-hv02", "KB5062070", "installed"],
  ["srv-app01", "KB5062071", "missing"],
  ["srv-app01", "KB5061990", "missing"],
  ["srv-print01", "KB5062071", "missing"],
  ["srv-print01", "KB5060998", "missing"],
  ["srv-print01", "KB5061990", "missing"],
  ["srv-print01", "KB5061566", "missing"],
];

// [server, days ago, duration seconds]
const REBOOTS: [string, number, number][] = [
  ["srv-dc01", 112, 341], ["srv-dc01", 143, 322], ["srv-dc01", 175, 367],
  ["srv-dc02", 47, 298], ["srv-dc02", 81, 312],
  ["srv-sql01a", 88, 684], ["srv-sql01a", 120, 731], ["srv-sql01a", 151, 655],
  ["srv-sql01b", 88, 702], ["srv-sql01b", 120, 668],
  ["srv-web01", 133, 204], ["srv-web01", 164, 189],
  ["srv-web02", 61, 176], ["srv-web02", 92, 198],
  ["srv-exch01", 156, 1245], ["srv-exch01", 187, 1310], ["srv-exch01", 218, 1180],
  ["srv-rds01", 74, 355], ["srv-rds02", 74, 341],
  ["srv-file01", 29, 264], ["srv-file01", 60, 241],
  ["srv-hv01", 121, 912], ["srv-hv01", 152, 887],
  ["srv-hv02", 95, 845], ["srv-hv02", 126, 902],
  ["srv-app01", 33, 231],
  ["srv-print01", 201, 412],
];

export function seedDemoData(db: Database.Database) {
  const now = new Date();
  const iso = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 86400000).toISOString();

  const insServer = db.prepare(
    `INSERT INTO servers (id, name, os, role, environment, criticality, ip, cluster, internet_facing, business_hours, uptime_days, pending_reboot, services, source, last_scan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?)`
  );
  const insCve = db.prepare(
    "INSERT INTO cves (id, cvss, severity, exploited, public_poc, description) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insPatch = db.prepare(
    `INSERT INTO patches (kb, title, classification, products, release_date, description, requires_reboot, size_mb, known_issues, breaking_changes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insPc = db.prepare("INSERT INTO patch_cves (kb, cve_id) VALUES (?, ?)");
  const insSp = db.prepare(
    "INSERT INTO server_patches (server_id, kb, status, detected_at, installed_at) VALUES (?, ?, ?, ?, ?)"
  );
  const insReboot = db.prepare(
    "INSERT INTO reboot_history (server_id, rebooted_at, duration_seconds, outcome) VALUES (?, ?, ?, 'success')"
  );

  const tx = db.transaction(() => {
    for (const s of SERVERS)
      insServer.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], JSON.stringify(s[12]), iso(0.2));
    for (const c of CVES) insCve.run(c[0], c[1], c[2], c[3], c[4], c[5]);
    for (const p of PATCHES)
      insPatch.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], JSON.stringify(p[8]), JSON.stringify(p[9]));
    for (const [kb, cve] of PATCH_CVES) insPc.run(kb, cve);
    for (const [srv, kb, status] of SERVER_PATCHES)
      insSp.run(srv, kb, status, iso(status === "missing" ? 18 : 40), status === "installed" ? iso(21) : null);
    for (const [srv, daysAgo, dur] of REBOOTS) insReboot.run(srv, iso(daysAgo), dur);
  });
  tx();
}
