import Anthropic from "@anthropic-ai/sdk";
import { getDb, getSetting } from "./db";
import { getCvesForPatch, getServersMissing, predictReboot, scorePatch } from "./engine";
import type { Cve, Explanation, Patch, Server } from "./types";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const OPENROUTER_MODEL = "anthropic/claude-opus-4.8";

function anthropicKey() {
  return getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY || "";
}
function openrouterKey() {
  return getSetting("openrouter_api_key") || process.env.OPENROUTER_API_KEY || "";
}

export function aiMode(): "anthropic" | "openrouter" | "mock" {
  if (process.env.PATCHGPT_MOCK === "1") return "mock";
  if (anthropicKey()) return "anthropic";
  if (openrouterKey()) return "openrouter";
  return "mock";
}

/** Extract the first JSON object from LLM output, tolerating fences and prose. */
function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in AI response");
  return JSON.parse(body.slice(start, end + 1)) as T;
}

async function complete(system: string, user: string): Promise<string> {
  const mode = aiMode();
  if (mode === "anthropic") {
    const client = new Anthropic({ apiKey: anthropicKey() });
    const stream = client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: user }],
    });
    const msg = await stream.finalMessage();
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (mode === "openrouter") {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("mock mode: complete() should not be called");
}

const SYSTEM_PROMPT = `You are PatchGPT, the analysis engine of an enterprise Windows patch management platform.
You explain patches and recommendations to system administrators and change advisory boards.
Ground every statement in the structured data provided — never invent CVEs, KB numbers, or servers.
Be specific about operational risk. Respond with strict JSON only, no markdown fences, matching the requested schema exactly.`;

// ---------- Patch explanation ----------

export async function explainPatch(patch: Patch, force = false): Promise<{ explanation: Explanation; model: string }> {
  const db = getDb();
  if (!force) {
    const cached = db.prepare("SELECT content, model FROM explanations WHERE kb = ?").get(patch.kb) as
      | { content: string; model: string }
      | undefined;
    if (cached) return { explanation: JSON.parse(cached.content), model: cached.model };
  }

  const cves = getCvesForPatch(patch.kb);
  const affected = getServersMissing(patch.kb);
  const priority = scorePatch(patch);

  let explanation: Explanation;
  let model: string;

  if (aiMode() === "mock") {
    explanation = mockExplainPatch(patch, cves, affected);
    model = "deterministic (no AI key configured)";
  } else {
    const user = `Explain this Windows patch for our environment. JSON schema:
{"summary": string (2-3 sentences, plain language),
 "security_fixes": string[] (what each fix actually prevents),
 "breaking_changes": string[] (empty array if none),
 "known_issues": string[] (empty array if none),
 "cve_severity": [{"id": string, "cvss": number, "severity": string, "exploited": boolean, "note": string (one-line risk context)}],
 "business_impact": string (what happens to THIS business if we don't patch, referencing the affected servers/roles below),
 "recommendation": string (concrete action with urgency, referencing the priority score factors)}

PATCH: ${JSON.stringify({ ...patch, known_issues: JSON.parse(patch.known_issues), breaking_changes: JSON.parse(patch.breaking_changes) })}
CVES: ${JSON.stringify(cves)}
AFFECTED SERVERS (missing this patch): ${JSON.stringify(affected.map((s) => ({ name: s.name, role: s.role, environment: s.environment, criticality: s.criticality, internet_facing: !!s.internet_facing, cluster: s.cluster })))}
COMPUTED PRIORITY: ${JSON.stringify(priority)}`;
    const raw = await complete(SYSTEM_PROMPT, user);
    explanation = parseJson<Explanation>(raw);
    model = aiMode() === "anthropic" ? ANTHROPIC_MODEL : OPENROUTER_MODEL;
  }

  db.prepare(
    `INSERT INTO explanations (kb, content, model, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(kb) DO UPDATE SET content = excluded.content, model = excluded.model, created_at = excluded.created_at`
  ).run(patch.kb, JSON.stringify(explanation), model, new Date().toISOString());

  return { explanation, model };
}

function mockExplainPatch(patch: Patch, cves: Cve[], affected: Server[]): Explanation {
  const priority = scorePatch(patch);
  const exploited = cves.filter((c) => c.exploited === 1);
  const roles = [...new Set(affected.map((s) => s.role))];
  const inet = affected.filter((s) => s.internet_facing === 1);

  return {
    summary: `${patch.title} is a ${patch.classification.toLowerCase()} released ${patch.release_date} addressing ${cves.length || "no tracked"} CVE${cves.length === 1 ? "" : "s"}. ${
      exploited.length
        ? `${exploited.length} of them ${exploited.length === 1 ? "is" : "are"} under active exploitation, which makes this time-sensitive.`
        : cves.length
          ? "None are known to be exploited yet, but the fixes close meaningful attack surface."
          : "It is a maintenance-quality update."
    } It is currently missing on ${affected.length} server${affected.length === 1 ? "" : "s"} (${roles.join(", ") || "none"}).`,
    security_fixes: cves.map(
      (c) => `${c.id}: ${c.description}`
    ),
    breaking_changes: JSON.parse(patch.breaking_changes),
    known_issues: JSON.parse(patch.known_issues),
    cve_severity: cves.map((c) => ({
      id: c.id,
      cvss: c.cvss,
      severity: c.severity,
      exploited: c.exploited === 1,
      note: c.exploited
        ? "Actively exploited — assume scanning against your address space is already happening."
        : c.public_poc
          ? "Public proof-of-concept exists — weaponization typically follows within weeks."
          : "No known exploitation; standard patching cadence applies.",
    })),
    business_impact: affected.length
      ? `Unpatched, this leaves ${affected.map((s) => s.name).join(", ")} exposed. ${
          inet.length
            ? `${inet.map((s) => s.name).join(", ")} ${inet.length === 1 ? "is" : "are"} internet-facing, so the vulnerable code is reachable by external attackers, not just insiders.`
            : "Exposure is internal-only, which lowers but does not remove the risk — lateral movement after an initial foothold is the standard playbook."
        } ${
          affected.some((s) => s.criticality >= 4)
            ? "Business-critical systems are in the affected set; a compromise or unplanned outage here interrupts core operations."
            : "Affected systems are lower-criticality, so business interruption from a compromise would be contained."
        }`
      : "All servers already have this patch installed; no residual exposure.",
    recommendation: `Priority ${priority.score}/100 (${priority.tier}). ${priority.factors.join(". ")}. ${
      priority.tier === "Critical"
        ? "Schedule an expedited deployment in the next available emergency window rather than waiting for the monthly cycle."
        : priority.tier === "High"
          ? "Deploy in the next scheduled maintenance window; do not defer to the following cycle."
          : "Deploy in the normal monthly cycle."
    }${patch.requires_reboot ? " A reboot is required — coordinate with the recommended maintenance windows per server." : " No reboot is required, so this can be deployed during business hours with low risk."}`,
  };
}

// ---------- Plan rationale ----------

export interface PlanInput {
  name: string;
  kbs: string[];
  rings: { name: string; serverIds: string[]; window: string }[];
}

export async function explainPlan(input: PlanInput): Promise<{ rationale: string; model: string }> {
  const db = getDb();
  const servers = db.prepare("SELECT * FROM servers").all() as Server[];
  const byId = new Map(servers.map((s) => [s.id, s]));
  const patches = input.kbs.map(
    (kb) => db.prepare("SELECT * FROM patches WHERE kb = ?").get(kb) as Patch
  );

  if (aiMode() === "mock") {
    const parts = input.rings.map((ring, i) => {
      const names = ring.serverIds.map((id) => byId.get(id)?.name ?? id);
      const impacts = ring.serverIds
        .map((id) => byId.get(id))
        .filter((s): s is Server => !!s)
        .map((s) => predictReboot(s));
      const maxMin = impacts.reduce((m, x) => Math.max(m, x.estimatedMinutes), 0);
      const high = impacts.filter((x) => x.risk === "high").length;
      return `Ring ${i + 1} (${ring.name}) patches ${names.join(", ")} in the "${ring.window}" window. Longest predicted outage is ~${maxMin} min${high ? `; ${high} server${high === 1 ? " carries" : "s carry"} elevated reboot risk and should be verified manually after boot` : ""}. ${
        i === 0
          ? "This ring goes first because failures here have the smallest blast radius, giving a burn-in period before critical systems."
          : i === input.rings.length - 1
            ? "This ring goes last so that any patch or reboot issue is caught earlier on lower-stakes systems."
            : "Cluster nodes and same-role peers are split across windows so a bad patch never takes down both sides of a redundant pair."
      }`;
    });
    const exploited = patches.filter((p) =>
      getCvesForPatch(p.kb).some((c) => c.exploited === 1)
    );
    return {
      rationale: `This plan deploys ${input.kbs.join(", ")} across ${input.rings.reduce((n, r) => n + r.serverIds.length, 0)} servers in ${input.rings.length} rings. ${
        exploited.length
          ? `${exploited.map((p) => p.kb).join(", ")} fix${exploited.length === 1 ? "es" : ""} actively exploited vulnerabilities, so the schedule is compressed rather than spread across multiple weeks.`
          : "No actively exploited CVEs are involved, so the rings use standard spacing."
      } ${parts.join(" ")}`,
      model: "deterministic (no AI key configured)",
    };
  }

  const user = `Write a deployment-plan rationale for a change advisory board (plain text, 1 paragraph per ring plus an opening paragraph, no markdown). Explain WHY the ring order, window choices, and cluster sequencing are what they are. Data:
PATCHES: ${JSON.stringify(patches.map((p) => ({ kb: p.kb, title: p.title, requires_reboot: !!p.requires_reboot, priority: scorePatch(p) })))}
RINGS: ${JSON.stringify(
    input.rings.map((r) => ({
      ...r,
      servers: r.serverIds.map((id) => {
        const s = byId.get(id);
        return s ? { name: s.name, role: s.role, cluster: s.cluster, criticality: s.criticality, rebootImpact: predictReboot(s) } : id;
      }),
    }))
  )}
Respond as JSON: {"rationale": string}`;
  const raw = await complete(SYSTEM_PROMPT, user);
  const parsed = parseJson<{ rationale: string }>(raw);
  return {
    rationale: parsed.rationale,
    model: aiMode() === "anthropic" ? ANTHROPIC_MODEL : OPENROUTER_MODEL,
  };
}
