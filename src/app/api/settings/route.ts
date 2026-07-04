import { NextRequest, NextResponse } from "next/server";
import { getDb, setSetting } from "@/lib/db";
import { aiMode } from "@/lib/ai";

const KEYS = [
  "anthropic_api_key",
  "openrouter_api_key",
  "azure_tenant_id",
  "azure_client_id",
  "azure_client_secret",
  "azure_subscription_id",
  "sccm_adminservice_url",
  "sccm_username",
  "sccm_password",
  "intune_tenant_id",
  "intune_client_id",
  "intune_client_secret",
];

const SECRET = new Set([
  "anthropic_api_key",
  "openrouter_api_key",
  "azure_client_secret",
  "sccm_password",
  "intune_client_secret",
]);

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const settings = KEYS.map((key) => ({
    key,
    set: !!map.get(key),
    // Secrets are write-only; non-secrets are shown.
    value: SECRET.has(key) ? undefined : map.get(key) ?? "",
  }));
  return NextResponse.json({ settings, aiMode: aiMode() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (!KEYS.includes(key)) continue;
    if (typeof value === "string" && value.length > 0) setSetting(key, value.trim());
    if (value === "") getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
  return NextResponse.json({ ok: true, aiMode: aiMode() });
}
