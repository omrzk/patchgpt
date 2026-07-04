import { getSetting } from "../db";
import type { Connector, DiscoveredServer } from "./base";

/**
 * SCCM / Configuration Manager connector.
 * Uses the ConfigMgr Administration Service (AdminService) OData REST API:
 *   https://<smsprovider>/AdminService/wmi/...
 * Auth: basic credentials of a Full Administrator (or token via CMG).
 */
export class SccmConnector implements Connector {
  name = "Microsoft Configuration Manager (SCCM)";
  description =
    "Queries the ConfigMgr AdminService REST API for device inventory (SMS_R_System) and missing software updates (SMS_UpdateComplianceStatus).";

  private creds() {
    return {
      baseUrl: getSetting("sccm_adminservice_url") || process.env.SCCM_ADMINSERVICE_URL || "",
      username: getSetting("sccm_username") || process.env.SCCM_USERNAME || "",
      password: getSetting("sccm_password") || process.env.SCCM_PASSWORD || "",
    };
  }

  isConfigured() {
    const c = this.creds();
    return !!(c.baseUrl && c.username && c.password);
  }

  private async get(path: string) {
    const c = this.creds();
    const res = await fetch(`${c.baseUrl.replace(/\/$/, "")}/${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`AdminService ${path} failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  async fetchServers(): Promise<DiscoveredServer[]> {
    // Server-OS devices
    const devices = await this.get(
      "wmi/SMS_R_System?$filter=contains(OperatingSystemNameandVersion,'Server')&$select=ResourceId,Name,OperatingSystemNameandVersion,IPAddresses"
    );

    const servers: DiscoveredServer[] = [];
    for (const d of devices.value ?? []) {
      // Missing updates for this device (Status 2 = required)
      const updates = await this.get(
        `wmi/SMS_UpdateComplianceStatus?$filter=MachineID eq ${d.ResourceId} and Status eq 2&$select=CI_ID`
      );
      const missingKbs = [];
      for (const u of updates.value ?? []) {
        const ci = await this.get(
          `wmi/SMS_SoftwareUpdate(${u.CI_ID})?$select=ArticleID,LocalizedDisplayName,DatePosted`
        );
        if (ci.ArticleID) {
          missingKbs.push({
            kb: `KB${ci.ArticleID}`,
            title: ci.LocalizedDisplayName,
            releaseDate: ci.DatePosted?.slice(0, 10),
          });
        }
      }
      servers.push({
        id: `sccm-${String(d.Name).toLowerCase()}`,
        name: d.Name,
        os: d.OperatingSystemNameandVersion ?? "Windows Server",
        role: "Managed Server",
        ip: Array.isArray(d.IPAddresses) ? d.IPAddresses[0] : undefined,
        missingKbs,
      });
    }
    return servers;
  }
}
