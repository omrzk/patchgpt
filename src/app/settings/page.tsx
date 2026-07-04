import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        AI keys and connector credentials. Secrets are write-only: they are stored server-side and
        never shown again. With no AI key, PatchGPT runs in deterministic mode — every feature
        works, with engine-generated explanations instead of LLM-written ones.
      </p>
      <SettingsForm />
    </>
  );
}
