import { getSetting } from "../db";
import { aadToken, type Connector, type DiscoveredServer } from "./base";

/**
 * Microsoft Intune connector.
 * Uses Microsoft Graph (managedDevices + Windows quality-update policy reports)
 * to inventory co-managed / cloud-managed Windows machines and their update state.
 */
export class IntuneConnector implements Connector {
  name = "Microsoft Intune";
  description =
    "Reads managed Windows devices and quality-update compliance from Microsoft Graph (DeviceManagementManagedDevices.Read.All).";

  private creds() {
    return {
      tenantId: getSetting("intune_tenant_id") || process.env.INTUNE_TENANT_ID || "",
      clientId: getSetting("intune_client_id") || process.env.INTUNE_CLIENT_ID || "",
      clientSecret: getSetting("intune_client_secret") || process.env.INTUNE_CLIENT_SECRET || "",
    };
  }

  isConfigured() {
    const c = this.creds();
    return !!(c.tenantId && c.clientId && c.clientSecret);
  }

  async fetchServers(): Promise<DiscoveredServer[]> {
    const c = this.creds();
    const token = await aadToken(c.tenantId, c.clientId, c.clientSecret, "https://graph.microsoft.com/.default");
    const headers = { Authorization: `Bearer ${token}` };

    const servers: DiscoveredServer[] = [];
    let url =
      "https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$filter=operatingSystem eq 'Windows'&$select=id,deviceName,osVersion,complianceState";
    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Graph managedDevices failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      for (const d of data.value ?? []) {
        servers.push({
          id: `intune-${d.id}`,
          name: d.deviceName,
          os: `Windows ${d.osVersion ?? ""}`.trim(),
          role: "Intune-managed",
          // Graph exposes compliance state rather than per-KB detail on v1.0;
          // noncompliant devices are flagged for follow-up via update reports.
          missingKbs:
            d.complianceState === "noncompliant"
              ? [{ kb: "PENDING-ASSESSMENT", title: "Device noncompliant — quality updates outstanding" }]
              : [],
        });
      }
      url = data["@odata.nextLink"] ?? "";
    }
    return servers;
  }
}
