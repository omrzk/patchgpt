# PatchGPT

AI-powered Windows patch management. Unlike WSUS, PatchGPT **explains** patches: what each fix
actually prevents, what might break, which CVEs matter, and what the business impact of deferring
is — and it explains **every recommendation it makes** (priority scores, maintenance windows,
reboot predictions, deployment ring ordering).

## What it does

- **Scan servers** — agentless demo scan out of the box; Azure Update Manager, SCCM (AdminService),
  and Intune (Microsoft Graph) connectors for real fleets.
- **Detect missing patches** — per-server missing-update state with detection timestamps.
- **AI patch explanations** — for every patch: security fixes, breaking changes, known issues,
  CVE severity (with exploitation status), and business impact grounded in *your* affected servers.
- **Prioritize deployment** — deterministic 0–100 priority score (CVSS, active exploitation,
  internet exposure, server criticality, patch age). The AI narrates the score; it never invents it.
- **Recommend maintenance windows** — from business hours, cluster membership, and predicted
  outage time, with the reasoning listed for each candidate window.
- **Predict reboot impact** — estimated outage from historical reboot durations + payload size,
  plus risk factors (pending reboots, long uptime, DC/Exchange roles, cluster failover needs).
- **Deployment plans** — ring-based rollout (burn-in → standard → business-critical), cluster
  nodes always split across windows, with an AI-written change-advisory-board rationale.
- **Dashboards** — compliance, exploited-CVE exposure, patch aging, per-environment posture,
  highest-risk servers.
- **Reports** — compliance and deployment reports generated from live data, downloadable as
  Markdown for change tickets and audits.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                            Next.js 15 (App Router)                 │
│                                                                    │
│  UI (server components + client islands)                          │
│  Dashboard · Servers · Patches · Plans · Reports · Settings       │
│            │                                                       │
│  API routes (/api/*)                                               │
│  scan · explain · plan · reports · settings                        │
│            │                                                       │
│  ┌─────────┴──────────┬───────────────────┬─────────────────────┐  │
│  │ Priority/Window/   │  AI layer          │  Connector layer    │  │
│  │ Reboot engine      │  (lib/ai.ts)       │  (lib/connectors)   │  │
│  │ (lib/engine.ts)    │  Anthropic API →   │  Azure Update Mgr   │  │
│  │ deterministic      │  OpenRouter →      │  (Resource Graph)   │  │
│  │ scoring — the AI   │  deterministic     │  SCCM AdminService  │  │
│  │ explains, never    │  mock (keyless)    │  Intune (MS Graph)  │  │
│  │ invents            │                    │  + demo scan        │  │
│  └────────────────────┴───────────────────┴─────────────────────┘  │
│            │                                                       │
│  SQLite (better-sqlite3, WAL) — servers, patches, CVEs,            │
│  server_patches, reboot_history, explanations (cache),             │
│  plans, reports, settings                                          │
└────────────────────────────────────────────────────────────────────┘
```

Design decisions:

- **Deterministic engine + AI narration.** Priority scores, reboot predictions, and window
  recommendations are computed from data. The LLM's job is explanation and rationale — grounded in
  the computed factors — so recommendations are reproducible and auditable.
- **Explanations are cached** per KB in SQLite and regenerated on demand, so tokens are spent once.
- **Keyless demo mode.** Without an API key the same JSON contract is produced by a deterministic
  generator, so the full workflow (explain → plan → report) is demonstrable anywhere.
- **Connectors are real API clients** (Azure AD client-credentials → Resource Graph; AdminService
  OData; Microsoft Graph) with a simulated fleet fallback for development and demos.
- **Swap seams**: SQLite → SQL Server/Postgres is a repository-level change; the connector
  interface (`lib/connectors/base.ts`) accepts additional sources (WSUS SUSDB, Tanium, etc.).

## Run

```bash
npm install
npm run dev        # http://localhost:3050
```

Optional environment/settings:

| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` (or Settings) | AI explanations via Anthropic (claude-opus-4-8) |
| `OPENROUTER_API_KEY` (or Settings) | Fallback LLM provider |
| `PATCHGPT_MOCK=1` | Force deterministic mode even with keys present |
| Azure/SCCM/Intune credentials | See Settings page for the exact fields |

The demo database seeds a fictional 14-server fleet ("Helios Dynamics") with a realistic
Patch-Tuesday backlog. All demo KB numbers, CVEs, and hostnames are simulated.

## Security notes

- Connector and AI secrets are write-only via the Settings API and stored server-side in SQLite.
- Run behind a reverse proxy with SSO in production; v1 has no built-in auth by design.
