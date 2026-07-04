import { getSetting } from "../db";
import { aadToken, type Connector, type DiscoveredServer } from "./base";

/**
 * Azure Update Manager connector.
 * Uses Azure Resource Graph (patchassessmentresources) to pull pending-update
 * assessments for Azure and Arc-enabled machines.
 */
export class AzureUpdateManagerConnector implements Connector {
  name = "Azure Update Manager";
  description =
    "Pulls machine inventory and pending-update assessments from Azure Resource Graph (Azure VMs + Arc-enabled servers).";

  private creds() {
    return {
      tenantId: getSetting("azure_tenant_id") || process.env.AZURE_TENANT_ID || "",
      clientId: getSetting("azure_client_id") || process.env.AZURE_CLIENT_ID || "",
      clientSecret: getSetting("azure_client_secret") || process.env.AZURE_CLIENT_SECRET || "",
      subscriptionId: getSetting("azure_subscription_id") || process.env.AZURE_SUBSCRIPTION_ID || "",
    };
  }

  isConfigured() {
    const c = this.creds();
    return !!(c.tenantId && c.clientId && c.clientSecret && c.subscriptionId);
  }

  async fetchServers(): Promise<DiscoveredServer[]> {
    const c = this.creds();
    const token = await aadToken(c.tenantId, c.clientId, c.clientSecret, "https://management.azure.com/.default");

    const query = `
      patchassessmentresources
      | where type =~ 'microsoft.compute/virtualmachines/patchassessmentresults/softwarepatches'
         or type =~ 'microsoft.hybridcompute/machines/patchassessmentresults/softwarepatches'
      | extend machine = tostring(split(id, '/patchAssessmentResults/')[0])
      | extend kb = tostring(properties.kbId), patchName = tostring(properties.patchName),
               classification = tostring(properties.classifications[0])
      | where isnotempty(kb)
      | project machine, kb, patchName, classification`;

    const res = await fetch(
      "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptions: [c.subscriptionId], query }),
      }
    );
    if (!res.ok) throw new Error(`Resource Graph query failed (${res.status}): ${await res.text()}`);
    const data = await res.json();

    const byMachine = new Map<string, DiscoveredServer>();
    for (const row of data.data ?? []) {
      const machineId: string = row.machine;
      const name = machineId.split("/").pop() ?? machineId;
      const entry = byMachine.get(machineId) ?? {
        id: `azure-${name.toLowerCase()}`,
        name,
        os: "Windows Server (Azure)",
        role: "Azure VM",
        missingKbs: [],
      };
      entry.missingKbs.push({
        kb: row.kb.startsWith("KB") ? row.kb : `KB${row.kb}`,
        title: row.patchName,
        classification: row.classification,
      });
      byMachine.set(machineId, entry);
    }
    return [...byMachine.values()];
  }
}
