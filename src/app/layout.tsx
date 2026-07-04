import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";

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
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
