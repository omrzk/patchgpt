import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";
import { isDemoMode } from "@/lib/db";

export const metadata: Metadata = {
  title: "PatchGPT — AI Windows Patch Management",
  description:
    "AI-powered Windows patch management: explains every patch, prioritizes deployment, predicts reboot impact.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              Patch<span>GPT</span>
            </div>
            <div className="brand-sub">AI patch management for Windows fleets</div>
            <Nav />
            <div className="sidebar-foot">
              Demo environment: Helios Dynamics (simulated fleet). Connect Azure Update Manager,
              SCCM, or Intune in Settings.
            </div>
          </aside>
          <main className="main">
            {isDemoMode() && (
              <div className="demo-banner">
                Live demo — simulated fleet, deterministic AI mode, read-only settings. Data resets
                every 2 hours.{" "}
                <a href="https://github.com/omrzk/patchgpt" target="_blank" rel="noreferrer">
                  Get the source on GitHub
                </a>
              </div>
            )}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
